# tilelive-cardboard

Implements the [tilelive API](https://github.com/mapbox/tilelive.js/blob/d7703bbf3a4f7084a4b225bc85c87ecab185ccb9/API.md) for creating mapnik vector tiles from a [cardboard](https://github.com/mapbox/cardboard) datasource.

## Initialization

There are two options for initializing the module. If you specify a `bbox`, then the cardboard database will be queried *once and only once* for data contained in that area. Subsequent `getTile()` requests will use the data harvested from that initial request.

Alternately, if no bbox is specified, then each `getTile()` request will perform its own query against the cardboard database.

```javascript
var CardboardTiles = require('tilelive-cardboard');

var config = {
    awsKey: 'secret',
    awsSecret: 'supersecret',
    table: 'geo',
    endpoint: 'http://localhost:4567',
    region: 'us-east-1',
    layer: 'my-cardboard-layer'
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
```

## Assumptions

- minzoom = 0
- maxzoom = 14
- buffer-size = 8