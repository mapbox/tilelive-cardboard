var test = require('tape');
var CardboardTiles = require('..');
var database = require('./database');
var VectorTile = require('vector-tile').VectorTile;
var Protobuf = require('pbf');
var _ = require('underscore');
var zlib = require('zlib');
var fs = require('fs');
var path = require('path');
var extent = require('geojson-extent');
var SphericalMercator = require('sphericalmercator');

var config = {
    table: 'geo',
    endpoint: 'http://localhost:4567',
    dataset: 'test.dataset',
    s3: require('mock-aws-s3').S3(),
    bucket: 'test',
    prefix: 'mockS3',
    region: 'fake'
};

var dynalite, expectedInfo, featureToCheck;

process.env.AWS_ACCESS_KEY_ID = 'fake';
process.env.AWS_SECRET_ACCESS_KEY = 'fake';

test('setup', function(t) {
    var fixture = path.join(__dirname, 'fixtures', 'random-data.geojson');
    fs.readFile(fixture, 'utf8', function(err, data) {
        t.ifError(err, 'loaded fixture');
        data = JSON.parse(data);

        var bbox = extent(data);
        expectedInfo = {
            vector_layers: [
                {
                    id: 'test_dataset',
                    minzoom:0,
                    maxzoom:10
                }
            ],
            minzoom: 0,
            maxzoom: 10,
            bounds: bbox,
            center: [
                ( bbox[2] + bbox[0] ) / 2,
                ( bbox[3] + bbox[1] ) / 2,
                0
            ]
        };

        featureToCheck = _.find(data.features, function(f) {
            return f.properties.test === 'check-my-coords';
        });

        database.setup(data, config, function(err) {
            t.ifError(err, 'loaded dynalite');
            t.end();
        });
    });
});

var cbt;

test('initialization: missing parameters', function(t) {
    new CardboardTiles(_(config).omit('table'), function(err, source) {
        t.equal(err.message, 'Missing keys in uri: table', 'expected error');
        t.end();
    });
});

test('initialization: missing info via string', function(t) {
    var uri = 'cardboard://' + [config.table, config.dataset, config.bucket].join('/');
    new CardboardTiles(uri, function(err, source) {
        t.equal(err.message, 'Missing keys in uri: prefix', 'expected error');
        t.end();
    });
});

test('initialization: success', function(t) {
    new CardboardTiles(config, function(err, source) {
        t.ifError(err, 'initialized successfully');
        t.ok(source instanceof CardboardTiles, 'returns correct object');
        cbt = source;
        t.end();
    });
});

var nullInfo = {
    bounds: [ -180, -85, 180, 85 ],
    center: [ 0, 0, 0 ],
    vector_layers: [ { id: 'test_dataset', maxzoom: 14, minzoom: 0 } ],
    maxzoom: 14,
    minzoom: 0
};

test('getInfo', function(t) {
    cbt.getInfo(function(err, info) {
        t.ifError(err, 'got metadata');
        t.ok(info.hasOwnProperty('updated'), 'metadata has updated timestamp');
        t.deepEqual(_.omit(info, 'updated'), nullInfo, 'got expected metadata');
        t.end();
    });
});

test('calculateInfo', function(t) {
    cbt.calculateInfo(function(err, info) {
        t.ifError(err, 'calculated metadata');
        t.ok(info.updated, 'metadata has updated timestamp');
        t.deepEqual(_.omit(info, 'updated'), expectedInfo, 'got expected metadata');
        t.end();
    })
});

function testTile(data, t) {
    zlib.gunzip(data, function(err, tileData) {
        t.ifError(err, 'unzipped tile');

        var tile = new VectorTile(new Protobuf(tileData));
        var sanitized = config.dataset.replace(/[^a-zA-Z0-9_]/ig, '_');
        var layer = tile.layers[sanitized];
        t.ok(layer, 'contains layer');
        t.equal(layer.name, sanitized, 'contains sanitized layer name');
        t.equal(layer.length, 43, 'contains correct number of features');

        var feature;
        for (var i = 0; i < layer.length; i++) {
            feature = layer.feature(i);
            if (feature.properties.test === 'check-my-coords') {
                t.pass('found test feature');
                break;
            }
        }

        var geom = feature.loadGeometry()[0][0];
        var sm = new SphericalMercator({ size: layer.extent });
        var tileOrigin = 15 * layer.extent;
        var found = sm.ll([tileOrigin + geom.x, tileOrigin + geom.y], 5);
        var expected = featureToCheck.geometry.coordinates;

        t.ok((found[0] - expected[0]) < .0002, 'X coordinate is within threshold');
        t.ok((found[1] - expected[1]) < .0002, 'Y coordinate is within threshold');
        t.deepEqual(feature.properties, { test: 'check-my-coords' }, 'feature has correct properties');
        t.end();
    });
}

test('getTile', function(t) {
    cbt.getTile(5, 15, 15, function(err, data) {
        t.ifError(err, 'got tile');
        testTile(data, t);
    });
});

test('teardown', function(t) {
    cbt.close(function(err) {
        t.ifError(err, 'closed tilelive-cardboard');
        database.teardown(function(err) {
            t.ifError(err, 'closed dynalite');
            t.end();
        });
    });
});

test('load worst line ever', function(t) {
    // this feature is big enough that it should trigger minzoom = 5
    var fixture = path.join(__dirname, 'fixtures', 'worst-line-ever.geojson');
    fs.readFile(fixture, 'utf8', function(err, data) {
        data = {
            type: 'FeatureCollection',
            features: [ JSON.parse(data) ]
        };

        database.setup(data, config, function(err) {
            t.ifError(err, 'loaded');
            t.end();
        })
    });
});

test('check minzoom calculation', function(t) {
    new CardboardTiles(config, function(err, src) {
        t.ifError(err, 'initialized');
        var cache = _.clone(src._cache);
        src.calculateInfo(function(err, info) {
            t.equal(info.minzoom, 5, 'correct minzoom');
            t.equal(info.maxzoom, 10, 'correct maxzoom');
            t.equal(info.center[2], 5, 'correct center zoom');
            t.notEqual(cache.minzoom, src._cache.minzoom, 'replaced cache');
            src.close(t.end.bind(t));
        });
    });
});

test('teardown', function(t) {
    database.teardown(t.end.bind(t));
});
