var Cardboard = require('cardboard');
var Bridge = require('tilelive-bridge');
var SphericalMercator = require('sphericalmercator');
var merc = new SphericalMercator({
    size: 512
});
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var xml = fs.readFileSync(path.join(__dirname, 'map.xml'), 'utf8');

module.exports = CardboardTiles;

function CardboardTiles(uri, callback) {
    // Should be able to parse connection data from a URI-type of string also
    // Maybe something like:
    // cardboard://key:secret@endpoint/region/table?bbox=w,s,e,n

    // These would all be required
    this._connection = {
        awsKey: uri.awsKey,
        awsSecret:  uri.awsSecret,
        table: uri.table,
        endpoint:  uri.endpoint,
        region: uri.region
    };

    // This too
    this._layer = uri.layer;

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
    if (this._preloaded) return this._bridge.getInfo(callback);
    
    // TODO: handle not-preloaded case, consider whether or not above is valid
    callback(new Error('not implemented'));
};

CardboardTiles.prototype.getTile = function(z, x, y, callback) {
    if (this._preloaded) return this._bridge.getTile(z, x, y, callback);
    
    var bbox = merc.bbox(x, y, z); // handle buffers on tiles?
    this._getXml(bbox, function(err, mapnikXml) {
        if (err) return callback(err);

        new Bridge({ xml: mapnikXml }, function(err, source) {
            if (err) return callback(err);

            source.getTile(z, x, y, callback);
        });
    });
};

CardboardTiles.prototype.close = function(callback) {
    if (this._bridge) return this._bridge.close(callback);
    callback();
};

CardboardTiles.prototype._getXml = function(bbox, callback) {
    var cardboard = Cardboard(this._connection);
    var layer = this._layer;

    cardboard.bboxQuery(bbox, layer, function(err, data) {
        if (err) return callback(err, data);

        data = data.map(function(feature) {
            return feature.val;
        });

        var geojson = {
            type: 'FeatureCollection',
            features: data
        };

        var center = [ 
            bbox[0] + bbox[2] / 2,
            bbox[1] + bbox[3] / 2
        ];

        // TODO: watch out for min/max zoom assumptions
        var params = {
            json: {vector_layers:[{"id":"OGRGeoJSON","description":"","minzoom":0,"maxzoom":14,"fields":{"name":"String","id":"String"}}]},
            center: center,
            bounds: bbox,
            minzoom: 0,
            maxzoom: 14,
            geojson: geojson,
            layer: layer
        };

        var preparedXml = _.template(xml)(params);

        callback(null, preparedXml);
    });
}
