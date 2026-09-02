FROM node:23-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_TLS_REJECT_UNAUTHORIZED=0
EXPOSE 3000

# start.js wraps `react-scripts start` to print an accurate access banner —
# the raw dev server advertises localhost:3000, which is internal to the
# Docker network and not reachable from the host (nginx is the entry point).
CMD ["node", "start.js"]