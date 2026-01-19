FROM node:22-alpine

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

RUN chmod -R 777 /app

RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "prod"]
