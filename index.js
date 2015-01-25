var config = require("./config");

var Client = require("./lib/Client");
var bunyan = require('bunyan');
var redis = require("redis");
        
var createCallbacksFactory = require("./lib/callbacksFactory");

var log = bunyan.createLogger({
    name: 'signaling server',
    serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res
    }
});

var env = process.env.NODE_ENV || "development";

if (env == "development") {
    log.level("debug");
}

var redisClient;
var redisLocation;
if (config.redis.socket) {
    redisClient = redis.createClient(config.redis.socket);
    redisLocation = config.redis.socket;
} else {
    redisLocation = config.redis.host + ":" + config.redis.port;
    redisClient = redis.createClient(config.redis.port, config.redis.host);
}
redisClient.on("error", function(err) {
    log.error("Redis error", err);
});

log.info("Waiting for connection to redis server " + redisLocation);
redisClient.on("ready", function() {
    log.info("Redis is ready at " + redisLocation);
    var WebSocketServer = require('websocket').server;
    var http = require('http');

    var server = http.createServer(function(request, response) {
        log.debug('Received request for ' + request.url);
        response.writeHead(404);
        response.end();
    });
    server.listen(config.port, function() {
        log.info('Server is listening on port ' + config.port);
    });

    wsServer = new WebSocketServer({
        httpServer: server,
        // You should not use autoAcceptConnections for production
        // applications, as it defeats all standard cross-origin protection
        // facilities built into the protocol and the browser.  You should
        // *always* verify the connection's origin and decide whether or not
        // to accept it.
        autoAcceptConnections: false
    });

    function originIsAllowed(origin) {
        log.trace("Origin", origin);
        // put logic here to detect whether the specified origin is allowed.
        return true;
    }

    var clients = [];
    var callbacksFactory = createCallbacksFactory(log, redisClient);
    wsServer.on('request', function(request) {
        if (!originIsAllowed(request.origin)) {
            // Make sure we only accept requests from an allowed origin
            request.reject();
            log.debug('Connection from origin ' + request.origin + ' rejected.');
            return;
        }

        var connection = request.accept('signaling', request.origin);
        log.trace('Connection accepted.');

        var client = new Client(connection, redisClient, log);
        clients.push(client);
        client.joinConversation(callbacksFactory, clients);
        connection.on('close', function(reasonCode, description) {
            var index = clients.indexOf(client);
            clients.splice(index, 1);

            client.dispose(clients);
            log.debug('Peer ' + connection.remoteAddress + ' disconnected.');
        });
    });
});
