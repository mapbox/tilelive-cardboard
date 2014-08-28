var test = require('tape');
var CardboardTiles = require('..');
var Cardboard = require('cardboard');
var VectorTile = require('vector-tile').VectorTile;
var Protobuf = require('pbf');
var queue = require('queue-async');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var config = {
    awsKey: 'fake',
    awsSecret: 'fake',
    table: 'geo',
    endpoint: 'http://localhost:4567',
    region: 'us-east-1',
    layer: 'test'
};

var dynalite;

test('setup', function(t) {
    var cardboard = new Cardboard(config);

    dynalite = require('dynalite')({
        createTableMs: 0,
        updateTableMs: 0,
        deleteTableMs: 0
    });

    dynalite.listen(4567, createTable);

    function createTable() {
        t.pass('dynalite listening');
        
        cardboard.createTable(config.table, function(err, resp){
            t.ifError(err, 'table created');
            loadData();
        });
    }

    function loadData() {
        var fixture = path.join(__dirname, 'fixtures', 'random-data.geojson');

        function insertFeature(feature, id, cb) {
            cardboard.insert(id, feature, config.layer, cb);
        }

        fs.readFile(fixture, 'utf8', function(err, data) {
            data = JSON.parse(data);

            var q = queue();

            data.features.forEach(function(f, i) {
                q.defer(insertFeature, f, i);
            });

            q.awaitAll(function(err) {
                t.ifError(err, 'data loaded');
                t.end();
            });
        });
    }
});

var preloaded, notPreloaded;

test('initialization: missing info', function(t) {
    new CardboardTiles(_(config).omit('table'), function(err, source) {
        t.equal(err.message, 'Missing keys in config: table', 'expected error');
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
        t.ok(tile.layers.OGRGeoJSON, 'contains layer');
        t.equal(tile.layers.OGRGeoJSON.length, 43, 'contains correct number of features');

        var geom = tile.layers.OGRGeoJSON.feature(0).loadGeometry();
        t.deepEqual(geom, [ [ { x: 3804, y: 3937 } ] ], 'feature has correct geometry');

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
    dynalite.close(function() {
        function closeTiles(cardboardTiles, callback) {
            cardboardTiles.close(callback);
        }
        queue()
            .defer(closeTiles, preloaded)
            .defer(closeTiles, notPreloaded)
            .awaitAll(function(err) {
                t.ifError(err, 'closed tilelive-cardboard');
                t.end();
            });
    });
});
