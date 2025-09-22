⚠️ This repository is no longer actively maintained by Mapbox.

##
# tilelive-cardboard

[![build status](https://travis-ci.com/mapbox/tilelive-cardboard.svg?branch=master)](https://travis-ci.com/mapbox/tilelive-cardboard)

Implements the [tilelive API](https://github.com/mapbox/tilelive.js/blob/d7703bbf3a4f7084a4b225bc85c87ecab185ccb9/API.md) for creating mapnik vector tiles from a [cardboard](https://github.com/mapbox/cardboard) datasource.

## Initialization

```javascript
var CardboardTiles = require('tilelive-cardboard');

var config = {
    table: 'geo',
    dataset: 'my-cardboard-dataset',
    bucket: 's3-bucket-for-large-geometries',
    prefix: 's3-prefix-for-large-geometries',
    region: 'region-for-cardboard-data'
};

new CardboardTiles(config, function(err, source) {
    source.getTile(9, 98, 207, function(err, tile) {
        console.log('queried cardboard and got a tile!');
    });
});

// You you can also specify these parameters as a URI:
var uri = 'cardboard://table/dataset/bucket/prefix/region';
new CardboardTiles(uri, function(err, src) { ... });
```

## Assumptions

- buffer-size = 8
