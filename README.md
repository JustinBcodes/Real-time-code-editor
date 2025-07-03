# Real-Time Collaborative Code Editor

A fully functional, real-time collaborative code editor built with FastAPI, React, TypeScript, and WebSockets. Multiple users can edit code simultaneously with live synchronization and conflict resolution.

## 🚀 Features

- **Real-time collaboration**: Multiple users editing simultaneously
- **WebSocket sync**: Live code updates across all connected clients
- **Conflict resolution**: Operational Transform (OT) for handling concurrent edits
- **Syntax highlighting**: Monaco Editor with full IDE features
- **Session management**: Create and join collaborative sessions
- **Cursor presence**: See where other users are editing (optional)

## 🛠 Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **WebSockets**: Real-time bidirectional communication
- **asyncio**: Asynchronous programming for handling multiple connections
- **uvicorn**: ASGI server for production deployment

### Frontend
- **React**: Component-based UI library
- **TypeScript**: Type-safe JavaScript development
- **Vite**: Fast build tool and dev server
- **Monaco Editor**: VS Code editor in the browser
- **TailwindCSS**: Utility-first CSS framework

## 📁 Project Structure

```
collab-code-editor/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + WebSocket endpoints
│   │   ├── manager.py       # WebSocket connection manager
│   │   ├── ot.py            # Operational transform logic
│   │   ├── sessions.py      # In-memory session tracking
│   └── requirements.txt     # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── context/         # WebSocket + session context
│   │   ├── hooks/           # Custom React hooks
│   │   ├── types/           # TypeScript type definitions
│   │   ├── App.tsx          # Main application component
│   │   └── main.tsx         # Application entry point
│   ├── package.json         # Node.js dependencies
│   └── vite.config.ts       # Vite configuration
│
├── README.md
└── .gitignore
```

## 🚦 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the FastAPI server:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

### Usage

1. Open your browser to `http://localhost:5173`
2. Create a new session or join an existing one
3. Start coding collaboratively!

## 🧪 Testing the Collaboration

1. Open multiple browser tabs/windows to `http://localhost:5173`
2. Join the same session ID
3. Start typing in one window and watch changes appear in real-time in others
4. Test conflict resolution by typing simultaneously in different positions

## 🔧 Development

### Running Tests
```bash
# Backend tests
cd backend
python -m pytest

# Frontend tests  
cd frontend
npm test
```

### Building for Production
```bash
# Frontend build
cd frontend
npm run build
```

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 