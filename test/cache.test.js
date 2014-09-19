var test = require('tape');
var database = require('./database');
var Cache = require('../lib/cache');
var CardboardTiles = require('../');
var Cardboard = require('cardboard');
var tilebelt = require('tilebelt');
var fs = require('fs');
var path = require('path');

var config = {
    table: 'geo',
    endpoint: 'http://localhost:4567',
    dataset: 'test.dataset',
    s3: require('mock-aws-s3').S3(),
    bucket: 'test',
    prefix: 'mockS3',
    region: 'fake'
};

process.env.AWS_ACCESS_KEY_ID = 'fake';
process.env.AWS_SECRET_ACCESS_KEY = 'fake';
process.env.AWS_DEFAULT_REGION = 'fake';

test('load data', function(t) {
    // Eight lines, one in each of eight adjacent z6 tiles.
    // Parent tiles are 5/14/15 and 5/15/15
    // Each line contains 5000 vertices, so each z5 tile should be over 500kb,
    // and so minzoom should be z5
    var fixture = path.join(__dirname, 'fixtures', 'eight-nasty-lines.geojson');
    fs.readFile(fixture, 'utf8', function(err, data) {
        data = JSON.parse(data);
        database.setup(data, config, function(err) {
            t.ifError(err, 'loaded data');
            t.end();
        });
    });
});

var cache, tilejson;

test('calculate info', function(t) {
    var cardboard = Cardboard(config);
    cardboard.calculateDatasetInfo(config.dataset, function(err, info) {
        t.ifError(err, 'calculated info');
        new CardboardTiles(config, function(err, src) {
            t.ifError(err, 'initialized cardboardTiles');
            src.getInfo(function(err, info) {
                t.ifError(err, 'got info');
                t.equal(info.minzoom, 5, 'expected minzoom');
                cache = new Cache(info, config.dataset, config);
                tilejson = info;
                src.close(t.end.bind(t));
            });
        });
    });
});

test('getTile', function(t) {
    cache.getTile(6, 28, 30, function(err, tile) {
        t.ifError(err, 'got tile');
        var key = tilebelt.tileToQuadkey([14, 15, 5]);
        var badKey = tilebelt.tileToQuadkey([15, 15, 5]);
        t.ok(cache[key], 'bridge obj cached for parent tile');
        t.notOk(cache[badKey], 'no extra bridge obj cached');
        t.end();
    });
});

test('locking', function(t) {
    var loadAttempts = 0;
    var getTileResponses = 0;
    var expectedErrors = 0;

    function mockLoader(bounds, dataset, callback) {
        loadAttempts++;
        setTimeout(function() {
            callback(new Error('Failed to load data'));
        }, 100);
    }

    function done() {
        t.equal(loadAttempts, 2, 'tried to load each root tile only once');
        t.equal(expectedErrors, 8, 'failed all requests');
        t.end();
    }

    var badCache = new Cache(tilejson, config.dataset, config, mockLoader);

    for (var x = 28; x < 32; x++) {
        for (var y = 30; y < 32; y++) {
            badCache.getTile(6, x, y, function(err, tile) {
                if (err) expectedErrors++;
                getTileResponses++;
                if (getTileResponses === 8) done();
            });
        }
    }
});

test('close database', function(t) {
    database.teardown(t.end.bind(t));
});

test('getTile from cache', function(t) {
    // Should be able to load data from a sibling, even though dynalite is off
    cache.getTile(6, 29, 30, function(err, tile) {
        t.ifError(err, 'loaded tile from cached bridge');
        t.end();
    });
});

test('getTile fail where data is missing', function(t) {
    // Loading a tile with a different root tile should fail because dynalite is off
    cache.getTile(6, 30, 30, function(err, tile) {
        t.ok(err, 'expected error');
        t.equal(err.errno, 'ECONNREFUSED', 'connection refused');
        t.end();
    });
});

test('close cache', function(t) {
    cache.close(function(err) {
        t.ifError(err, 'closed cache');
        t.end();
    });
})
