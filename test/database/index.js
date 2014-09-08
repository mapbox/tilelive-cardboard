var Cardboard = require('cardboard');
var queue = require('queue-async');

var dynalite;

module.exports = {

    setup: function(data, config, callback) {
        var cardboard = Cardboard(config);

        dynalite = require('dynalite')({
            createTableMs: 0,
            updateTableMs: 0,
            deleteTableMs: 0
        });

        dynalite.listen(4567, createTable);

        function createTable() {
            cardboard.createTable(config.table, function(err, resp){
                if (err) return callback(err);
                loadData();
            });
        }

        function loadData() {

            function insertFeature(feature, cb) {
                cardboard.put(feature, config.dataset, cb);
            }

            var q = queue(100);

            data.features.forEach(function(f) {
                q.defer(insertFeature, f);
            });

            q.awaitAll(callback);
        }
    },

    teardown: function(callback) {
        dynalite.close(callback);
    }
};