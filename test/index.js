var test = require('tape');
var CardboardTiles = require('..');
var database = require('./database');
var VectorTile = require('vector-tile').VectorTile;
var Protobuf = require('pbf');
var queue = require('queue-async');
var _ = require('underscore');
var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

var config = {
    table: 'geo',
    endpoint: 'http://localhost:4567',
    dataset: 'test'
};

var dynalite;

// Expects AWS creds to be set via env vars
function setCreds() {
    process.env.AWS_ACCESS_KEY_ID = 'fake';
    process.env.AWS_SECRET_ACCESS_KEY = 'fake';
    process.env.AWS_DEFAULT_REGION = 'fake';    
}

setCreds();

test('setup', function(t) {
    var fixture = path.join(__dirname, 'fixtures', 'random-data.geojson');
    fs.readFile(fixture, 'utf8', function(err, data) {
        t.ifError(err, 'loaded fixture');
        data = JSON.parse(data);
        database.setup(data, config, function(err) {
            t.ifError(err, 'loaded dynalite');
            t.end();
        })
    });
});

var preloaded, notPreloaded;

test('initialization: missing info', function(t) {
    new CardboardTiles(_(config).omit('table'), function(err, source) {
        t.equal(err.message, 'Missing keys in config: table', 'expected error');
        t.end();
    });
});

test('initialization: sanitizes dataset name', function(t) {
    var newDatasetName = _({ dataset: 'test.sanitization' }).defaults(config);
    new CardboardTiles(newDatasetName, function(err, source) {
        t.ifError(err, 'initialized successfully');
        t.equal(source._info.json.vector_layers[0].id, 'test_sanitization', 'sanitized properly');
        t.end();
    });
});

test('initialization: fails without AWS creds in environment', function(t) {
    delete process.env.AWS_SECRET_ACCESS_KEY;
    new CardboardTiles(config, function(err, source) {
        t.equal(err.message, 'Missing AWS credentials in environment', 'expected error');
        setCreds();
        t.end();
    });
});

test('initialization: no preload', function(t) {
    new CardboardTiles(config, function(err, source) {
        t.ifError(err, 'initialized successfully');
        t.ok(source instanceof CardboardTiles, 'returns correct object');
        notPreloaded = source;
        t.end();
    });
});

test('initialization: preload', function(t) {
    config.bbox = [-1, -1, 1, 1];
    new CardboardTiles(config, function(err, source) {
        t.ifError(err, 'initialized successfully');
        t.ok(source instanceof CardboardTiles, 'returns correct object');
        preloaded = source;
        t.end();
    });
});

var expectedInfo = {
    json: {
        vector_layers: [
            {
                id: 'test',
                minzoom:0,
                maxzoom:14
            }
        ]
    },
    minzoom: 0,
    maxzoom: 14
};

test('getInfo: no preload', function(t) {
    notPreloaded.getInfo(function(err, info) {
        t.ifError(err, 'got metadata');
        t.deepEqual(info, expectedInfo, 'got expected metadata');
        t.end();
    });
});

test('getInfo: preload', function(t) {
    preloaded.getInfo(function(err, info) {
        t.ifError(err, 'got metadata');
        t.deepEqual(info, expectedInfo, 'got expected metadata');
        t.end();
    });
});

function testTile(data, t) {
    zlib.gunzip(data, function(err, tileData) {
        t.ifError(err, 'unzipped tile');
        
        var tile = new VectorTile(new Protobuf(tileData));
        var layer = tile.layers[config.dataset];
        t.ok(layer, 'contains layer');
        t.equal(layer.length, 43, 'contains correct number of features');

        var geom = layer.feature(0).loadGeometry();
        t.deepEqual(geom, [ [ { x: 3804, y: 3937 } ] ], 'feature has correct geometry');
        t.deepEqual(layer.feature(0).properties, { test: 'yes'}, 'feature has correct properties');
        t.end();
    });
}

test('getTile: preload', function(t) {
    preloaded.getTile(5, 15, 15, function(err, data) {
        t.ifError(err, 'got tile');
        testTile(data, t);
    });
});

test('getTile: no preload', function(t) {
    notPreloaded.getTile(5, 15, 15, function(err, data) {
        t.ifError(err, 'got tile');
        testTile(data, t);
    });
});

test('teardown', function(t) {
    function closeTiles(cardboardTiles, callback) {
        cardboardTiles.close(callback);
    }

    queue()
        .defer(closeTiles, preloaded)
        .defer(closeTiles, notPreloaded)
        .awaitAll(function(err) {
            t.ifError(err, 'closed tilelive-cardboard');
            database.teardown(function(err) {
                t.ifError(err, 'closed dynalite');
                t.end();
            });
        });
});
