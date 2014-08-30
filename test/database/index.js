var Cardboard = require('cardboard');
var queue = require('queue-async');

var dynalite;

module.exports = {

    setup: function(data, config, callback) {
        var cardboard = new Cardboard(config);

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

            function insertFeature(feature, id, cb) {
                cardboard.insert(id, feature, config.dataset, cb);
            }

            var q = queue();

            data.features.forEach(function(f, i) {
                q.defer(insertFeature, f, i);
            });

            q.awaitAll(callback);
        }
    },

    teardown: function(callback) {
        dynalite.close(callback);
    }
};