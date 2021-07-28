FROM node:16.5.0-buster-slim AS pre-package-lock
WORKDIR /app
COPY package.json /app/

FROM pre-package-lock AS jest
COPY package-lock.json /app/
ENV NODE_ENV development
RUN npm install
# caller must mount /app
COPY jest.config.js tsconfig.json .
VOLUME /app/src
VOLUME /app/test
CMD [ "npm", "test" ]

FROM pre-package-lock AS app
COPY package-lock.json /app/
ENV NODE_ENV production
RUN npm install
COPY server.js /app/
COPY src/ /app/src/
EXPOSE 8080
CMD [ "node", "server.js" ]
