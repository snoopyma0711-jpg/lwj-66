FROM node:18-alpine

WORKDIR /app

ENV DB_DIR=/app/data

COPY package*.json ./

RUN npm install --production

COPY server.js ./

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.js"]
