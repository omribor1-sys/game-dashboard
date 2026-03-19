FROM node:22-slim

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy pre-built frontend
COPY frontend/dist/ ./frontend/dist/

# Create data directory for SQLite volume
RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "backend/server.js"]
