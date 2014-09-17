var Cardboard = require('cardboard');
var Bridge = require('tilelive-bridge');
var SphericalMercator = require('sphericalmercator');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var xml = fs.readFileSync(path.join(__dirname, 'map.xml'), 'utf8');
var url = require('url');

// Assumptions.
var tileSize = 256, defaultBuffer = 8;

var merc = new SphericalMercator({ size: tileSize });

module.exports = CardboardTiles;
module.exports.Cardboard = Cardboard;

function CardboardTiles(uri, callback) {
    if (typeof uri === 'string') {
        // cardboard://table/dataset/bucket/prefix?bbox=w,s,e,n

        uri = url.parse(uri, true, true);

        if (uri.protocol !== 'cardboard:')
            return callback(new Error('Invalid protocol'));

        uri.table = uri.host;
        var details = uri.pathname.slice(1).split('/');
        if (details[0]) uri.dataset = details[0];
        if (details[1]) uri.bucket = details[1];
        if (details[2]) uri.prefix = details[2];
        if (uri.query.bbox) uri.bbox = uri.query.bbox.split(',');
    }

    var missingKeys = _([
        'table',
        'dataset',
        'bucket',
        'prefix'
    ]).difference(Object.keys(uri));

    if (missingKeys.length > 0) 
        return callback(new Error('Missing keys in uri: ' + missingKeys.join(', ')));

    this._connection = {
        table: uri.table,
        endpoint:  uri.endpoint,
        region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
        bucket: uri.bucket,
        prefix: uri.prefix
    };

    this._dataset = uri.dataset;

    var self = this;

    self.getInfo(function(err) {
        if (err) return callback(err);
        if (uri.bbox) return preload();
        callback(null, self);
    });

    function preload() {
        self._getXml(uri.bbox, function(err, mapnikXml) {
            if (err) return callback(err);

            new Bridge({ xml: mapnikXml }, function(err, source) {
                if (err) return callback(err);

                self._bridge = source;
                self._preloaded = true;

                callback(null, self);
            });
        });
    }
}

CardboardTiles.registerProtocols = function(tilelive) {
    tilelive.protocols['cardboard:'] = CardboardTiles;
};

CardboardTiles.prototype.calculateInfo = function(callback) {
    var cardboard = Cardboard(this._connection);
    var source = this;

    cardboard.calculateDatasetInfo(this._dataset, function(err, metadata) {
        if (err) return callback(err);
        source._info = metadataToTileJSON(source._dataset, metadata);
        callback(null, source._info);
    });
};

CardboardTiles.prototype.getInfo = function(callback) {
    if (this._info) return callback(null, this._info);

    var cardboard = Cardboard(this._connection);
    var source = this;

    cardboard.getDatasetInfo(this._dataset, function(err, metadata) {
        if (err) return callback(err);
        source._info = metadataToTileJSON(source._dataset, metadata);
        callback(null, source._info);
    });
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
    
    this.getInfo(function(err, info) {
        if (err) return callback(err);

        cardboard.bboxQuery(bbox, dataset, function(err, data) {
            if (err) return callback(err, data);

            var params = _({
                buffer: defaultBuffer,
                geojson: data,
                dataset: layerid(dataset)
            }).extend(info);

            var preparedXml = _.template(xml)(params);

            callback(null, preparedXml);
        });
    });
};

function layerid(id) {
    return id.replace(/[^a-zA-Z0-9_]/ig, '_');
}

// Heuristic lifted from mapnik-omnivore
function getMinMaxZoom(bytes, extent) {
    var maxSize = 500 * 1024;
    var maxzoom = 14;
    for (z = 14; z >= 0; z--) {
        var bounds = merc.xyz(extent, z, false, 4326);
        var x = (bounds.maxX - bounds.minX) + 1;
        var y = (bounds.maxY - bounds.minY) + 1;
        var tiles = x * y;
        var avgTileSize = bytes / tiles;

        // The idea is that tilesize of ~1000 bytes is usually the most detail
        // needed, and no need to process tiles with higher zoom
        if (avgTileSize < 1000) maxzoom = z;

        // Tiles are getting too large at current z
        if (avgTileSize > maxSize)
            return { min: z, max: maxzoom };

        // If all the data fits into one tile, it'll fit all the way to z0
        if (tiles === 1 || z === 0)
            return { min: 0, max: maxzoom };
    }
}

function metadataToTileJSON(dataset, metadata) {
    var bounds = [
        metadata.west || -180,
        metadata.south || -85,
        metadata.east || 180,
        metadata.north || 85
    ];
    var zooms = getMinMaxZoom(metadata.size, bounds);

    return {
        json: {
            vector_layers: [
                {
                    id: layerid(dataset),
                    minzoom: zooms.min,
                    maxzoom: zooms.max
                }
            ]
        },
        bounds: bounds,
        center: [
            ( bounds[2] + bounds[0] ) / 2,
            ( bounds[3] + bounds[1] ) / 2,
            0
        ],
        minzoom: zooms.min,
        maxzoom: zooms.max
    };
}
