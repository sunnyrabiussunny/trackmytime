FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
COPY frontend/ ./frontend/
EXPOSE 8888
CMD ["node", "server.js"]
