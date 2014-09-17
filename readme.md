# tilelive-cardboard

[![build status](https://travis-ci.org/mapbox/tilelive-cardboard.svg?branch=master)](https://travis-ci.org/mapbox/tilelive-cardboard)

Implements the [tilelive API](https://github.com/mapbox/tilelive.js/blob/d7703bbf3a4f7084a4b225bc85c87ecab185ccb9/API.md) for creating mapnik vector tiles from a [cardboard](https://github.com/mapbox/cardboard) datasource.

## Initialization

There are two options for initializing the module. If you specify a `bbox`, then the cardboard database will be queried *once and only once* for data contained in that area. Subsequent `getTile()` requests will use the data harvested from that initial request.

Alternately, if no bbox is specified, then each `getTile()` request will perform its own query against the cardboard database.

```javascript
var CardboardTiles = require('tilelive-cardboard');

var config = {
    table: 'geo',
    dataset: 'my-cardboard-dataset',
    bucket: 's3-bucket-for-large-geometries',
    prefix: 's3-prefix-for-large-geometries'
};

// One query per getTile request:
new CardboardTiles(config, function(err, source) {
    source.getTile(9, 98, 207, function(err, tile) {
        console.log('queried cardboard and got a tile!');
    });
});

// Preload data for some area:
config.bbox = [ -111, 30, -109, 34 ];
new CardboardTiles(config, function(err, source) {
    console.log('queried cardboard!');
    source.getTile(9, 98, 207, function(err, tile) {
        console.log('got a tile without querying again!');
    });
});

// You you can also specify these parameters as a URI:
var uri = 'cardboard://table/dataset/bucket/prefix?bbox=w,s,e,n';
new CardboardTiles(uri, function(err, src) { ... });
```

## Assumptions

- buffer-size = 8
