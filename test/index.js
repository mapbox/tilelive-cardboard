var test = require('tape');
var CardboardTiles = require('..');
var Cardboard = require('cardboard');
var queue = require('queue-async');
var fs = require('fs');
var path = require('path');

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

test('getInfo: no preload', function(t) {
    notPreloaded.getInfo(function(err, info) {
        t.ifError(err, 'got metadata');
        t.end();
    });
});

test('getInfo: preload', function(t) {
    preloaded.getInfo(function(err, info) {
        t.ifError(err, 'got metadata');
        
        var expected = {
            bounds: [ -1, -1, 1, 1 ],
            center: [ -0.5, -0.5 ],
            format: 'pbf',
            vector_layers: [
                {
                    id: "OGRGeoJSON",
                    description: "",
                    minzoom: 0,
                    maxzoom: 14,
                    fields: {
                        name: "String",
                        id: "String"
                    }
                }
            ],
            maxzoom: 14,
            minzoom: 0
        };

        t.deepEqual(info, expected, 'got expected metadata');

        t.end();
    });
});

test('getTile: preload', function(t) {
    preloaded.getTile(5, 15, 15, function(err, tile) {
        t.ifError(err, 'got tile');
        // TODO: check the tile for correctness
        t.end();
    });
});

test('getTile: no preload', function(t) {
    notPreloaded.getTile(5, 15, 15, function(err, tile) {
        t.ifError(err, 'got tile');
        // TODO: check the tile for correctness
        t.end();
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
