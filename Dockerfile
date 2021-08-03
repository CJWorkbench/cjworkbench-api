FROM node:16.5.0-buster-slim AS pre-package-lock
ENTRYPOINT []
WORKDIR /app
COPY package.json /app/

FROM pre-package-lock AS production-deps
COPY package-lock.json /app/
ENV NODE_ENV production
RUN npm install

FROM pre-package-lock AS development
COPY package-lock.json /app/
ENV NODE_ENV development
RUN npm install
COPY jest.config.js tsconfig.json .

FROM development AS jest
VOLUME /app/src
VOLUME /app/test
CMD [ "npm", "test" ]

FROM development AS build
COPY src/ /app/src
RUN npm run-script build  # output /app/dist/*

FROM production-deps AS production
COPY --from=build /app/dist/ /app/dist/
EXPOSE 8080
CMD [ "node", "dist/server.js" ]
