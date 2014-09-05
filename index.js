var Cardboard = require('cardboard');
var Bridge = require('tilelive-bridge');
var SphericalMercator = require('sphericalmercator');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var xml = fs.readFileSync(path.join(__dirname, 'map.xml'), 'utf8');

// Assumptions.
var tileSize = 256, defaultBuffer = 8,
    defaultMinZoom = 0, defaultMaxZoom = 14;

var merc = new SphericalMercator({
    size: tileSize
});

module.exports = CardboardTiles;
module.exports.Cardboard = Cardboard;

function CardboardTiles(uri, callback) {
    // TODO: Should be able to parse connection data from a URI-type of string
    // Maybe something like:
    // cardboard://table/dataset?bbox=w,s,e,n&endpoint=...

    var missingKeys = _([
        'table',
        'dataset'
    ]).difference(Object.keys(uri));

    if (missingKeys.length > 0) 
        return callback(new Error('Missing keys in config: ' + missingKeys.join(', ')));

    this._connection = {
        awsKey: process.env.AWS_ACCESS_KEY_ID,
        awsSecret: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
        table: uri.table,
        endpoint:  uri.endpoint,
        region: process.env.AWS_DEFAULT_REGION || 'us-east-1'
    };

    if (!this._connection.awsKey || !this._connection.awsSecret || !this._connection.region)
        return callback(new Error('Missing AWS credentials in environment'));

    this._dataset = uri.dataset;

    // Default vector tile info
    this._info = {
        json: {
            vector_layers: [
                {
                    id: uri.dataset.replace(/\./g, '_'),
                    minzoom: defaultMinZoom,
                    maxzoom: defaultMaxZoom
                }
            ]
        },
        minzoom: defaultMinZoom,
        maxzoom: defaultMaxZoom
    };

    // Optionally provide bbox for preloading data
    if (uri.bbox) {
        var self = this;
        this._getXml(uri.bbox, function(err, mapnikXml) {
            if (err) return callback(err);

            new Bridge({ xml: mapnikXml }, function(err, source) {
                if (err) return callback(err);

                self._bridge = source;
                self._preloaded = true;

                callback(null, self);
            });
        });
    } else {
        callback(null, this);
    }
}

CardboardTiles.prototype.getInfo = function(callback) {
    callback(null, this._info);
};

CardboardTiles.prototype.getTile = function(z, x, y, callback) {
    if (this._preloaded) return this._bridge.getTile(z, x, y, callback);

    var px = [
        ( tileSize * x ) - defaultBuffer,
        ( tileSize * ( y + 1 ) ) + defaultBuffer,
        ( tileSize * ( x + 1 ) ) + defaultBuffer,
        ( tileSize * y ) - defaultBuffer
    ];

    var buffered = [
        merc.ll([ px[0], px[3] ], z)[0],
        merc.ll([ px[0], px[1] ], z)[1],
        merc.ll([ px[2], px[1] ], z)[0],
        merc.ll([ px[2], px[3] ], z)[1]
    ];

    this._getXml(buffered, function(err, mapnikXml) {
        if (err) return callback(err);

        new Bridge({ xml: mapnikXml }, function(err, source) {
            if (err) return callback(err);

            source.getTile(z, x, y, function(err, tile) {
                source.close(function() {
                    callback(err, tile);
                });
            });
        });
    });
};

CardboardTiles.prototype.close = function(callback) {
    if (this._bridge) return this._bridge.close(callback);
    callback();
};

CardboardTiles.prototype._getXml = function(bbox, callback) {
    var cardboard = Cardboard(this._connection);
    var dataset = this._dataset;
    var info = this._info;

    cardboard.bboxQuery(bbox, dataset, function(err, data) {
        if (err) return callback(err, data);

        data = data.map(function(feature) {
            return feature.val;
        });

        var geojson = {
            type: 'FeatureCollection',
            features: data
        };

        var params = _({
            buffer: defaultBuffer,
            geojson: geojson,
            dataset: dataset,
            minzoom: defaultMinZoom,
            maxzoom: defaultMaxZoom
        }).extend(info);

        var preparedXml = _.template(xml)(params);

        callback(null, preparedXml);
    });
}
