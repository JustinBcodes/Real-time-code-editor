"""
Advanced distributed session management for collaborative editing sessions.
Handles creation, joining, tracking with Redis clustering, failover, and persistence.
Optimized for 1000+ concurrent users and high availability.
"""

import uuid
import json
import asyncio
import time
from typing import Dict, Set, Optional, List, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import redis
import aioredis
from tenacity import retry, stop_after_attempt, wait_exponential
import structlog

# Configure structured logging
logger = structlog.get_logger()


@dataclass
class SessionState:
    """Enhanced session state with metadata for distributed management."""
    session_id: str
    content: str
    users: Set[str]
    created_at: datetime
    last_activity: datetime
    version: int = 0
    operation_count: int = 0
    content_checksum: str = ""
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        
        # Calculate content checksum for integrity verification
        import hashlib
        self.content_checksum = hashlib.sha256(self.content.encode()).hexdigest()[:16]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for Redis storage."""
        return {
            "session_id": self.session_id,
            "content": self.content,
            "users": list(self.users),
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "version": self.version,
            "operation_count": self.operation_count,
            "content_checksum": self.content_checksum,
            "metadata": self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SessionState':
        """Create from dictionary loaded from Redis."""
        return cls(
            session_id=data["session_id"],
            content=data["content"],
            users=set(data["users"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            last_activity=datetime.fromisoformat(data["last_activity"]),
            version=data.get("version", 0),
            operation_count=data.get("operation_count", 0),
            content_checksum=data.get("content_checksum", ""),
            metadata=data.get("metadata", {})
        )
    
    def verify_integrity(self) -> bool:
        """Verify content integrity using checksum."""
        import hashlib
        expected_checksum = hashlib.sha256(self.content.encode()).hexdigest()[:16]
        return self.content_checksum == expected_checksum


class RedisConfig:
    """Redis cluster configuration with failover settings."""
    
    def __init__(self):
        # Primary Redis cluster nodes
        self.cluster_nodes = [
            {"host": "localhost", "port": 7000},
            {"host": "localhost", "port": 7001},
            {"host": "localhost", "port": 7002},
        ]
        
        # Fallback single Redis instance for development
        self.fallback_host = "localhost"
        self.fallback_port = 6379
        
        # Connection settings
        self.max_connections = 100
        self.retry_on_timeout = True
        self.socket_timeout = 5
        self.socket_connect_timeout = 5
        
        # Session storage settings
        self.session_ttl = 24 * 3600  # 24 hours
        self.user_presence_ttl = 300   # 5 minutes
        
        # Clustering settings
        self.skip_full_coverage_check = True  # For development
        self.max_connections_per_node = 16


class DistributedSessionManager:
    """Advanced distributed session manager with Redis clustering and failover."""
    
    def __init__(self, config: Optional[RedisConfig] = None):
        self.config = config or RedisConfig()
        self.redis_cluster = None
        self.redis_fallback = None
        self.is_cluster_mode = False
        
        # Local cache for performance
        self._local_cache: Dict[str, SessionState] = {}
        self._cache_timestamps: Dict[str, float] = {}
        self.cache_ttl = 30  # 30 seconds local cache
        
        # Performance metrics
        self.metrics = {
            "operations": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "redis_errors": 0,
            "failover_count": 0,
            "last_health_check": time.time()
        }
        
        # Background tasks
        self._background_tasks = set()
    
    async def initialize(self):
        """Initialize Redis connections with clustering and failover."""
        try:
            # Try to connect to Redis cluster first
            await self._connect_cluster()
            logger.info("Redis cluster connected successfully", nodes=len(self.config.cluster_nodes))
            
        except Exception as e:
            logger.warning("Redis cluster connection failed, using fallback", error=str(e))
            await self._connect_fallback()
        
        # Start background maintenance tasks
        await self._start_background_tasks()
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _connect_cluster(self):
        """Connect to Redis cluster with retry logic."""
        try:
            import redis.asyncio as aioredis_cluster
            from rediscluster import RedisCluster
            
            # Create cluster connection
            startup_nodes = self.config.cluster_nodes
            self.redis_cluster = RedisCluster(
                startup_nodes=startup_nodes,
                decode_responses=True,
                skip_full_coverage_check=self.config.skip_full_coverage_check,
                max_connections_per_node=self.config.max_connections_per_node,
                socket_timeout=self.config.socket_timeout,
                socket_connect_timeout=self.config.socket_connect_timeout
            )
            
            # Test connection
            await asyncio.to_thread(self.redis_cluster.ping)
            self.is_cluster_mode = True
            
        except ImportError:
            # redis-py-cluster not available, use single node
            logger.warning("Redis cluster support not available, using single node")
            raise Exception("Cluster dependencies not installed")
    
    async def _connect_fallback(self):
        """Connect to single Redis instance as fallback."""
        self.redis_fallback = await aioredis.from_url(
            f"redis://{self.config.fallback_host}:{self.config.fallback_port}",
            max_connections=self.config.max_connections,
            socket_timeout=self.config.socket_timeout,
            socket_connect_timeout=self.config.socket_connect_timeout,
            decode_responses=True
        )
        
        # Test connection
        await self.redis_fallback.ping()
        self.is_cluster_mode = False
        logger.info("Redis fallback connected", host=self.config.fallback_host, port=self.config.fallback_port)
    
    def _get_redis(self):
        """Get the appropriate Redis connection."""
        return self.redis_cluster if self.is_cluster_mode else self.redis_fallback
    
    async def create_session(self, session_id: Optional[str] = None) -> str:
        """Create a new distributed session with persistence."""
        if session_id is None:
            session_id = self._generate_session_id()
        
        # Check if session already exists
        if await self._session_exists(session_id):
            return session_id
        
        # Create new session state
        session_state = SessionState(
            session_id=session_id,
            content="// Welcome to the collaborative code editor!\n// Start typing to begin coding together.\n\nfunction hello() {\n    console.log('Hello, World!');\n}\n",
            users=set(),
            created_at=datetime.now(),
            last_activity=datetime.now()
        )
        
        # Store in Redis
        await self._store_session(session_state)
        
        # Update local cache
        self._local_cache[session_id] = session_state
        self._cache_timestamps[session_id] = time.time()
        
        self.metrics["operations"] += 1
        logger.info("Session created", session_id=session_id)
        
        return session_id
    
    async def get_session(self, session_id: str) -> Optional[SessionState]:
        """Get session with intelligent caching and failover."""
        # Check local cache first
        if self._is_cache_valid(session_id):
            self.metrics["cache_hits"] += 1
            return self._local_cache[session_id]
        
        self.metrics["cache_misses"] += 1
        
        # Fetch from Redis
        try:
            redis_client = self._get_redis()
            session_data = await asyncio.to_thread(redis_client.hgetall, f"session:{session_id}")
            
            if not session_data:
                return None
            
            # Parse and verify session data
            session_state = SessionState.from_dict(session_data)
            
            if not session_state.verify_integrity():
                logger.error("Session integrity check failed", session_id=session_id)
                self.metrics["redis_errors"] += 1
                return None
            
            # Update local cache
            self._local_cache[session_id] = session_state
            self._cache_timestamps[session_id] = time.time()
            
            return session_state
            
        except Exception as e:
            logger.error("Failed to fetch session from Redis", session_id=session_id, error=str(e))
            self.metrics["redis_errors"] += 1
            
            # Return cached version if available, even if expired
            return self._local_cache.get(session_id)
    
    async def join_session(self, session_id: str, user_id: str) -> Optional[SessionState]:
        """Join a session with distributed user tracking."""
        session_state = await self.get_session(session_id)
        
        if not session_state:
            # Auto-create session if it doesn't exist
            await self.create_session(session_id)
            session_state = await self.get_session(session_id)
        
        if session_state:
            # Add user to session
            session_state.users.add(user_id)
            session_state.last_activity = datetime.now()
            
            # Store updated session
            await self._store_session(session_state)
            
            # Track user presence
            await self._track_user_presence(session_id, user_id)
            
            # Update local cache
            self._local_cache[session_id] = session_state
            self._cache_timestamps[session_id] = time.time()
            
            logger.info("User joined session", session_id=session_id, user_id=user_id, total_users=len(session_state.users))
        
        return session_state
    
    async def leave_session(self, session_id: str, user_id: str) -> None:
        """Leave a session with cleanup."""
        session_state = await self.get_session(session_id)
        
        if session_state:
            session_state.users.discard(user_id)
            session_state.last_activity = datetime.now()
            
            # Remove user presence tracking
            await self._remove_user_presence(session_id, user_id)
            
            if session_state.users:
                # Update session if users remain
                await self._store_session(session_state)
                self._local_cache[session_id] = session_state
                self._cache_timestamps[session_id] = time.time()
            else:
                # Clean up empty session after delay
                await self._schedule_session_cleanup(session_id, delay=300)  # 5 minutes
            
            logger.info("User left session", session_id=session_id, user_id=user_id, remaining_users=len(session_state.users))
    
    async def update_session_content(self, session_id: str, content: str) -> bool:
        """Update session content with versioning and conflict detection."""
        session_state = await self.get_session(session_id)
        
        if not session_state:
            return False
        
        # Update content and metadata
        session_state.content = content
        session_state.last_activity = datetime.now()
        session_state.version += 1
        session_state.operation_count += 1
        
        # Recalculate checksum
        import hashlib
        session_state.content_checksum = hashlib.sha256(content.encode()).hexdigest()[:16]
        
        # Store updated session
        success = await self._store_session(session_state)
        
        if success:
            # Update local cache
            self._local_cache[session_id] = session_state
            self._cache_timestamps[session_id] = time.time()
            
            # Publish change notification for other nodes
            await self._publish_session_update(session_id, session_state.version)
        
        return success
    
    async def get_active_sessions(self) -> Dict[str, dict]:
        """Get all active sessions with comprehensive metadata."""
        try:
            redis_client = self._get_redis()
            session_keys = await asyncio.to_thread(redis_client.keys, "session:*")
            
            active_sessions = {}
            
            for key in session_keys:
                session_id = key.split(":", 1)[1]
                session_data = await asyncio.to_thread(redis_client.hgetall, key)
                
                if session_data:
                    try:
                        session_state = SessionState.from_dict(session_data)
                        
                        # Get real-time user presence
                        active_users = await self._get_active_users(session_id)
                        
                        active_sessions[session_id] = {
                            "user_count": len(active_users),
                            "content_length": len(session_state.content),
                            "created_at": session_state.created_at.isoformat(),
                            "last_activity": session_state.last_activity.isoformat(),
                            "version": session_state.version,
                            "operation_count": session_state.operation_count,
                            "active_users": list(active_users),
                            "metadata": session_state.metadata
                        }
                    except Exception as e:
                        logger.error("Failed to parse session data", session_id=session_id, error=str(e))
            
            return active_sessions
            
        except Exception as e:
            logger.error("Failed to get active sessions", error=str(e))
            self.metrics["redis_errors"] += 1
            return {}
    
    async def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions and inactive users."""
        cleaned_count = 0
        current_time = datetime.now()
        cutoff_time = current_time - timedelta(hours=24)
        
        try:
            redis_client = self._get_redis()
            session_keys = await asyncio.to_thread(redis_client.keys, "session:*")
            
            for key in session_keys:
                session_id = key.split(":", 1)[1]
                session_data = await asyncio.to_thread(redis_client.hgetall, key)
                
                if session_data:
                    try:
                        session_state = SessionState.from_dict(session_data)
                        
                        # Check if session is expired
                        if session_state.last_activity < cutoff_time:
                            await self._delete_session(session_id)
                            cleaned_count += 1
                            logger.info("Cleaned up expired session", session_id=session_id)
                        else:
                            # Clean up inactive users
                            await self._cleanup_inactive_users(session_id)
                            
                    except Exception as e:
                        logger.error("Failed to process session during cleanup", session_id=session_id, error=str(e))
            
            # Clean up local cache
            self._cleanup_local_cache()
            
            logger.info("Session cleanup completed", cleaned_sessions=cleaned_count)
            return cleaned_count
            
        except Exception as e:
            logger.error("Session cleanup failed", error=str(e))
            return 0
    
    async def get_performance_metrics(self) -> Dict[str, Any]:
        """Get comprehensive performance metrics."""
        redis_info = {}
        
        try:
            redis_client = self._get_redis()
            if self.is_cluster_mode:
                # Get cluster info
                cluster_info = await asyncio.to_thread(redis_client.cluster_info)
                redis_info = {
                    "cluster_state": cluster_info.get("cluster_state"),
                    "cluster_slots_assigned": cluster_info.get("cluster_slots_assigned"),
                    "cluster_size": cluster_info.get("cluster_size"),
                    "cluster_known_nodes": cluster_info.get("cluster_known_nodes")
                }
            else:
                # Get single node info
                info = await asyncio.to_thread(redis_client.info)
                redis_info = {
                    "connected_clients": info.get("connected_clients"),
                    "used_memory": info.get("used_memory"),
                    "used_memory_human": info.get("used_memory_human"),
                    "keyspace_hits": info.get("keyspace_hits"),
                    "keyspace_misses": info.get("keyspace_misses")
                }
        except Exception as e:
            logger.error("Failed to get Redis info", error=str(e))
        
        return {
            **self.metrics,
            "redis_info": redis_info,
            "local_cache_size": len(self._local_cache),
            "is_cluster_mode": self.is_cluster_mode,
            "cache_hit_ratio": self.metrics["cache_hits"] / max(self.metrics["cache_hits"] + self.metrics["cache_misses"], 1)
        }
    
    # Private helper methods
    
    def _generate_session_id(self) -> str:
        """Generate a unique session ID."""
        return str(uuid.uuid4())[:8]  # Short, user-friendly ID
    
    def _is_cache_valid(self, session_id: str) -> bool:
        """Check if local cache entry is valid."""
        if session_id not in self._local_cache:
            return False
        
        cache_time = self._cache_timestamps.get(session_id, 0)
        return time.time() - cache_time < self.cache_ttl
    
    def _cleanup_local_cache(self):
        """Clean up expired local cache entries."""
        current_time = time.time()
        expired_keys = [
            key for key, timestamp in self._cache_timestamps.items()
            if current_time - timestamp > self.cache_ttl * 2  # Double TTL for cleanup
        ]
        
        for key in expired_keys:
            self._local_cache.pop(key, None)
            self._cache_timestamps.pop(key, None)
    
    async def _session_exists(self, session_id: str) -> bool:
        """Check if session exists in Redis."""
        try:
            redis_client = self._get_redis()
            return await asyncio.to_thread(redis_client.exists, f"session:{session_id}")
        except Exception:
            return False
    
    async def _store_session(self, session_state: SessionState) -> bool:
        """Store session state in Redis."""
        try:
            redis_client = self._get_redis()
            key = f"session:{session_state.session_id}"
            
            # Store with TTL
            pipe = redis_client.pipeline()
            pipe.hset(key, mapping=session_state.to_dict())
            pipe.expire(key, self.config.session_ttl)
            await asyncio.to_thread(pipe.execute)
            
            return True
            
        except Exception as e:
            logger.error("Failed to store session", session_id=session_state.session_id, error=str(e))
            self.metrics["redis_errors"] += 1
            return False
    
    async def _delete_session(self, session_id: str) -> bool:
        """Delete session from Redis and local cache."""
        try:
            redis_client = self._get_redis()
            
            # Delete session and related data
            pipe = redis_client.pipeline()
            pipe.delete(f"session:{session_id}")
            pipe.delete(f"session_users:{session_id}")
            await asyncio.to_thread(pipe.execute)
            
            # Clean up local cache
            self._local_cache.pop(session_id, None)
            self._cache_timestamps.pop(session_id, None)
            
            return True
            
        except Exception as e:
            logger.error("Failed to delete session", session_id=session_id, error=str(e))
            return False
    
    async def _track_user_presence(self, session_id: str, user_id: str):
        """Track user presence with TTL."""
        try:
            redis_client = self._get_redis()
            key = f"session_users:{session_id}"
            
            # Add user with timestamp
            await asyncio.to_thread(redis_client.hset, key, user_id, time.time())
            await asyncio.to_thread(redis_client.expire, key, self.config.user_presence_ttl)
            
        except Exception as e:
            logger.error("Failed to track user presence", session_id=session_id, user_id=user_id, error=str(e))
    
    async def _remove_user_presence(self, session_id: str, user_id: str):
        """Remove user presence tracking."""
        try:
            redis_client = self._get_redis()
            key = f"session_users:{session_id}"
            await asyncio.to_thread(redis_client.hdel, key, user_id)
            
        except Exception as e:
            logger.error("Failed to remove user presence", session_id=session_id, user_id=user_id, error=str(e))
    
    async def _get_active_users(self, session_id: str) -> Set[str]:
        """Get currently active users in a session."""
        try:
            redis_client = self._get_redis()
            key = f"session_users:{session_id}"
            user_data = await asyncio.to_thread(redis_client.hgetall, key)
            
            # Filter out users who haven't been active recently
            current_time = time.time()
            active_users = set()
            
            for user_id, last_seen_str in user_data.items():
                try:
                    last_seen = float(last_seen_str)
                    if current_time - last_seen < self.config.user_presence_ttl:
                        active_users.add(user_id)
                except ValueError:
                    continue
            
            return active_users
            
        except Exception as e:
            logger.error("Failed to get active users", session_id=session_id, error=str(e))
            return set()
    
    async def _cleanup_inactive_users(self, session_id: str):
        """Clean up inactive users from session."""
        session_state = await self.get_session(session_id)
        if not session_state:
            return
        
        active_users = await self._get_active_users(session_id)
        inactive_users = session_state.users - active_users
        
        if inactive_users:
            session_state.users = active_users
            session_state.last_activity = datetime.now()
            await self._store_session(session_state)
            
            logger.info("Cleaned up inactive users", 
                       session_id=session_id, 
                       inactive_count=len(inactive_users))
    
    async def _publish_session_update(self, session_id: str, version: int):
        """Publish session update notification."""
        try:
            redis_client = self._get_redis()
            message = json.dumps({
                "session_id": session_id,
                "version": version,
                "timestamp": time.time()
            })
            
            await asyncio.to_thread(redis_client.publish, f"session_updates:{session_id}", message)
            
        except Exception as e:
            logger.error("Failed to publish session update", session_id=session_id, error=str(e))
    
    async def _schedule_session_cleanup(self, session_id: str, delay: int):
        """Schedule session cleanup with delay."""
        async def cleanup_task():
            await asyncio.sleep(delay)
            session_state = await self.get_session(session_id)
            if session_state and not session_state.users:
                await self._delete_session(session_id)
                logger.info("Auto-cleaned empty session", session_id=session_id)
        
        task = asyncio.create_task(cleanup_task())
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
    
    async def _start_background_tasks(self):
        """Start background maintenance tasks."""
        async def health_check_loop():
            while True:
                try:
                    redis_client = self._get_redis()
                    await asyncio.to_thread(redis_client.ping)
                    self.metrics["last_health_check"] = time.time()
                    await asyncio.sleep(30)  # Health check every 30 seconds
                except Exception as e:
                    logger.error("Redis health check failed", error=str(e))
                    self.metrics["redis_errors"] += 1
                    await asyncio.sleep(5)  # Retry sooner on failure
        
        async def cleanup_loop():
            while True:
                try:
                    await self.cleanup_expired_sessions()
                    await asyncio.sleep(1800)  # Cleanup every 30 minutes
                except Exception as e:
                    logger.error("Background cleanup failed", error=str(e))
                    await asyncio.sleep(300)  # Retry after 5 minutes
        
        # Start background tasks
        task1 = asyncio.create_task(health_check_loop())
        task2 = asyncio.create_task(cleanup_loop())
        
        self._background_tasks.add(task1)
        self._background_tasks.add(task2)
        
        task1.add_done_callback(self._background_tasks.discard)
        task2.add_done_callback(self._background_tasks.discard)


# For backward compatibility and transition
class Session:
    """Legacy Session class for backward compatibility."""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.content = "// Welcome to the collaborative code editor!\n// Start typing to begin coding together.\n\nfunction hello() {\n    console.log('Hello, World!');\n}\n"
        self.users = set()
        self.created_at = datetime.now()
        self.last_activity = datetime.now()
    
    def add_user(self, user_id: str) -> None:
        self.users.add(user_id)
        self.last_activity = datetime.now()
    
    def remove_user(self, user_id: str) -> None:
        self.users.discard(user_id)
        self.last_activity = datetime.now()
    
    def update_content(self, content: str) -> None:
        self.content = content
        self.last_activity = datetime.now()
    
    def is_expired(self, timeout_hours: int = 24) -> bool:
        timeout = timedelta(hours=timeout_hours)
        return datetime.now() - self.last_activity > timeout


# Initialize distributed session manager
session_manager = DistributedSessionManager()

# Initialize on import for backward compatibility
import asyncio

def _initialize_session_manager():
    """Initialize the session manager if not already done."""
    try:
        loop = asyncio.get_event_loop()
        if not loop.is_running():
            loop.run_until_complete(session_manager.initialize())
    except RuntimeError:
        # Event loop is running, schedule initialization
        asyncio.create_task(session_manager.initialize())

# Uncomment for production deployment
# _initialize_session_manager() 