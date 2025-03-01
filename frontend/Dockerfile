FROM node:23-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_TLS_REJECT_UNAUTHORIZED=0
EXPOSE 3000

CMD ["npm", "start"]