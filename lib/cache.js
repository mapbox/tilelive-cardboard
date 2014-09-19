var tilebelt = require('tilebelt');
var Bridge = require('tilelive-bridge');
var Cardboard = require('cardboard');
var SphericalMercator = require('sphericalmercator');
var queue = require('queue-async');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var util = require('util');
var events = require('events');

var tileSize = 256, buffer = 8;
var sm = new SphericalMercator({ size: tileSize });
var xml = fs.readFileSync(path.join(__dirname, 'map.xml'), 'utf8');

module.exports = Cache;

function Cache(info, dataset, connection, loader) {
    this.minzoom = info.minzoom;
    this._info = info;
    this._dataset = dataset;
    this._bridges = {};
    this._loader = loader || Cardboard(connection).bboxQuery;
    events.EventEmitter.call(this);
}

util.inherits(Cache, events.EventEmitter);

Cache.prototype.getTile = function(z, x, y, callback) {
    var root = rootTile(this.minzoom, [x, y, z]);
    var key = tilebelt.tileToQuadkey(root);
    var cache = this;

    // Another request is currently caching data for this root tile
    // Wait for event to fire when cache is unlocked
    if (cache._bridges[key] && cache._bridges[key] === 'locked')
        return cache.once(key, function(err) {
            if (err) return callback(err);
            cache.getTile(z, x, y, callback);
        });

    // Use cached tilelive-bridge if it exists
    if (cache._bridges[key]) return cache._bridges[key].getTile(z, x, y, callback);

    // Otherwise lock the cache, load data and instantiate tilelive-bridge
    cache._bridges[key] = 'locked';
    var bbox = bufferedBbox(z, x, y);

    cache._loader(bbox, cache._dataset, function(err, data) {
        function fail(error) {
            cache.emit(key, error);
            delete cache._bridges[key];
            callback(err);
        }

        if (err) return fail(err);

        // Use cardboard data to prepare Mapnik XML
        var params = _({
            buffer: buffer,
            geojson: data,
            dataset: cache._info.json.vector_layers[0].id
        }).extend(cache._info);

        var preparedXml = _.template(xml)(params);

        // Cache the tilelive-bridge object and satisfy the initial request
        new Bridge({ xml: preparedXml }, function(err, source) {
            if (err) return fail(err);

            cache._bridges[key] = source;
            cache.emit(key);
            source.getTile(z, x, y, callback);
        });
    });
};

Cache.prototype.close = function(callback) {
    var q = queue();
    var cache = this;
    Object.keys(cache._bridges).forEach(function(k) {
        var bridge = cache._bridges[k];
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
