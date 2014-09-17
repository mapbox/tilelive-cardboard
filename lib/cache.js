var tilebelt = require('tilebelt');
var Bridge = require('tilelive-bridge');
var Cardboard = require('cardboard');
var SphericalMercator = require('sphericalmercator');
var queue = require('queue-async');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var tileSize = 256, buffer = 8;
var sm = new SphericalMercator({ size: tileSize });
var xml = fs.readFileSync(path.join(__dirname, 'map.xml'), 'utf8');

module.exports = Cache;

function Cache(info, dataset, connection) {
    this.minzoom = info.minzoom;
    this._info = info;
    this._connection = connection;
    this._dataset = dataset;
}

Cache.prototype.getTile = function(z, x, y, callback) {
    var root = rootTile(this.minzoom, [x, y, z]);
    var key = tilebelt.tileToQuadkey(root);
    var cache = this;

    // Another request is currently caching data for this root tile
    // Please try again later.  
    if (cache[key] && cache[key] === 'locked') return setTimeout(function() {
        cache.getTile(z, x, y, callback);
    }, 100);

    // Use cached tilelive-bridge if it exists
    if (cache[key]) return cache[key].getTile(z, x, y, callback);

    // Otherwise lock the cache, load data and instantiate tilelive-bridge
    cache[key] = 'locked';
    var cardboard = Cardboard(cache._connection);
    var bbox = bufferedBbox(z, x, y);

    cardboard.bboxQuery(bbox, cache._dataset, function(err, data) {
        if (err) return callback(err);

        // Use cardboard data to prepare Mapnik XML
        var params = _({
            buffer: buffer,
            geojson: data,
            dataset: cache._info.json.vector_layers[0].id
        }).extend(cache._info);

        var preparedXml = _.template(xml)(params);

        // Cache the tilelive-bridge object and satisfy the initial request
        new Bridge({ xml: preparedXml }, function(err, source) {
            if (err) return callback(err);
            cache[key] = source;
            source.getTile(z, x, y, callback);
        });
    });
};

Cache.prototype.close = function(callback) {
    var q = queue();
    var cache = this;
    Object.keys(cache).forEach(function(k) {
        var bridge = cache[k];
        if (typeof bridge.close === 'function')
            q.defer(bridge.close.bind(bridge));
    });
    q.await(callback);
};


function rootTile(minzoom, tile) {
    if (tile[2] === minzoom) return tile;
    var parent = tilebelt.getParent(tile);
    while (parent[2] > minzoom) parent = tilebelt.getParent(parent);
    return parent;
}

function bufferedBbox(z, x, y) {
    var px = [
        ( tileSize * x ) - buffer,
        ( tileSize * ( y + 1 ) ) + buffer,
        ( tileSize * ( x + 1 ) ) + buffer,
        ( tileSize * y ) - buffer
    ];
    return [
        sm.ll([ px[0], px[3] ], z)[0],
        sm.ll([ px[0], px[1] ], z)[1],
        sm.ll([ px[2], px[1] ], z)[0],
        sm.ll([ px[2], px[3] ], z)[1]
    ];
}