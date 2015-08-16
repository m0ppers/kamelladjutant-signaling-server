# link to 2.5 due to this https://github.com/barrysteyn/node-scrypt/issues/82
FROM iojs:2.5
EXPOSE 9891
RUN mkdir /opt/signaling-server
COPY . /opt/signaling-server
WORKDIR /opt/signaling-server
RUN rm -rf node_modules && npm install && cp config.js.master config.js
CMD ["iojs", "index"]
