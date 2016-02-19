;(function (root) {
  var app = root.app = angular.module("anyfin", ["nvd3"]);

  var Murloc = (function () {
    function Murloc (attrs) {
      if ('string' === typeof attrs) {
        attrs = Murloc.murlocs[attrs];
      }

      for (var attr in attrs) {
        if (attrs.hasOwnProperty(attr)) {
          this[attr] = attrs[attr];
        }
      }
    }

    var attack = 
      Murloc.prototype.attack = function (onboard, data) {
        if (!onboard && !this.charge) return 0;
        return this.power + (2 * data.w) + data.g;
      };

    Murloc.murlocs = {
      t: { 
        name: "Murloc Tidecaller",
        power: 1,
        deckImg: 'assets/images/bars/murloc-tidecaller.png',
        cardImg: 'assets/images/cards/tidecaller.png',
        attack: function (onboard, data) {
          var retv = attack.call(this, onboard, data);
          return onboard ? retv + data.summoned : retv;
        }
      },
      g: { 
        name: "Grimscale Oracle",
        power: 1,
        deckImg: 'assets/images/bars/grimscale-oracle.png',
        cardImg: 'assets/images/cards/oracle.png',
        attack: function (onboard, data) {
          data.g -= 1;
          return attack.call(this, onboard, data);
        }
      },
      b: { 
        name: "Bluegill Warrior",
        charge: true,
        power: 2,
        deckImg: 'assets/images/bars/bluegill-warrior.png',
        cardImg: 'assets/images/cards/bluegill.png'
      },
      w: {
        name: "Murloc Warleader",
        power: 3,
        deckImg: 'assets/images/bars/murloc-warleader.png',
        cardImg: 'assets/images/cards/warleader.png',
        attack: function (onboard, data) {
          data.w -= 1;
          return attack.call(this, onboard, data);
        }
      },
      m: {
        name: "Old Murk-Eye",
        charge: true,
        power: 2,
        deckImg: 'assets/images/bars/old-murk-eye.png',
        cardImg: 'assets/images/cards/murkeye.png',
        attack: function (onboard, data) {
          return attack.call(this, onboard, data) + data.total - 1;
        }
      },
      o: {
        name: "Other Murlocs",
        deckImg: 'assets/images/bars/murloc-tinyfin.png',
        cardImg: 'assets/images/cards/tinyfin.png',
        power: 1
      }
    };

    return Murloc;
  }());


  function State (board, graveyard, opponent) {
    this.board = angular.copy(board);
    this.graveyard = {raw: angular.copy(graveyard)};
    this.opponent = angular.copy(opponent);

    this.initGraveyard();
    this.buildSets();
    this.buildMetrics();
    this.buildGraphData();
  }

  State.prototype.free = function () {
    return 7 - this.board.length;
  };

  State.prototype.initGraveyard = function () {
    this.graveyard.list = _.reduce(this.graveyard.raw, function (o, val, key) {
      for (var i=0; i<val; i++) { o.push(key); };
      return o;
    }, []);

    this.graveyard.combos = 
      root.helpers.combinations(this.graveyard.list, this.free());

    this.graveyard.summoned = 
      this.graveyard.combos[0] ? this.graveyard.combos[0].length : 0;

    this.graveyard.data = 
      _.reduce(this.graveyard.combos, function (o, arr) {
        var key = arr.sort().join('');
        o[key] || (o[key] = {count: 0});
        o[key].count += 1;
        o[key].set = arr;
        o[key].key = key;
        return o;
      }, {});
  };

  /**
   *
   * param [Object] onboard - an array of murloc data objects representing the board
   * param Object combo - data about a particular graveyard summon combo
   * @api private
   */
  State.prototype.addSet = function (onboard, combo) {
    var set = {};
    var state = this;

    // start building the murloc board state data.  It begins with just the 
    // opponents murlocs, and is build up as sets are added.  This is passed
    // along to each murloc to determine their damage
    var murlocs = {
      summoned: this.graveyard.summoned,
      total: this.opponent.o + this.opponent.w + this.opponent.g,
      g: this.opponent.g,
      w: this.opponent.w
    };

    _.each(onboard.concat(combo.set || []), function count(id) {
      // again, account for board murloc objects vs ids
      if (id.murloc) id = id.murloc;

      // if it's an oracle, increment total oracles
      if ('g' == id) murlocs.g += 1;
      // if it's a warleader, incrememt warleaders
      else if ('w' == id) murlocs.w += 1;

      // then increment the total
      murlocs.total += 1
    });

    var toMurloc = function (id, i, list) {
      var power, m, onboard = false;
      // Account for board murlocs, replacing obj with id and noting
      // the updated power
      if (id.murloc) {
        // The combo.set, which is also passed through this function, is just
        // an array of letter IDs, so if id.murloc is a property, this minion
        // is "onboard".  This is passed to the attack function to designate
        // primarily that the murloc doesn't need charge to do damage.
        onboard = true;
        power = id.power;
        id = id.murloc;
      }
      m = new Murloc(id);

      // if power was found, overwrite it on the murloc obj
      if ('undefined' !== typeof power) {
        m.power = power;
      }
      // then overwrite the attack function with an attack value
      // calculated from the current state
      m.attack = m.attack(onboard, angular.copy(murlocs));

      return m;
    };

    set.onboard = _.map(onboard, toMurloc);
    set.onboard.damage = root.helpers.sum(set.onboard, 'attack');

    set.graveyard = _.map(combo.set, toMurloc);
    set.graveyard.damage = root.helpers.sum(set.graveyard, 'attack');

    set.damage = set.onboard.damage + set.graveyard.damage;

    // unless there are no summons, the combo data will have a key
    if (combo.key) {
      set.count = combo.count;
      set.key = combo.key;
    }

    this.sets.push(set);
  };

  State.prototype.buildSets = function () {
    this.sets = [];

    var onboard = _.reject(this.board, function (minion) {
      return !minion.murloc;
    });

    if (this.graveyard.combos.length) {
      _.each(this.graveyard.data, function (data, key) {
        this.addSet(onboard, data);
      }, this);
    } 
    else if (onboard.length) {
      this.addSet(onboard, {});
    }

    this.sets.sort(function (a, b) {
      return a.damage - b.damage;
    });

    this.sets.min = this.sets[0];
    this.sets.max = this.sets[this.sets.length-1];
    this.sets.total = this.graveyard.combos.length || 1;

    this.sets.grouped = _.reduce(this.sets, function (o, set) {
      o[set.damage] || (o[set.damage] = {count: 0, set: []});
      o[set.damage].set.push(set);
      o[set.damage].count += set.count;
      return o;
    }, {});
  };

  State.prototype.buildMetrics = function () {
    this.metrics = {};

    this.metrics.min = this.sets.min ? this.sets.min.damage : 0;
    this.metrics.max = this.sets.max ? this.sets.max.damage : 0;
      
    if (this.sets.length > 1 && this.metrics.max > 0) {
      this.metrics.sum = _.reduce(this.sets, function (sum, set) {
        return sum + set.count * set.damage;
      }, 0);

      // actually calcualte the average (which was preset to 0)
      this.metrics.avg = this.metrics.sum / this.sets.total;

      this.metrics.variance = _.chain(this.sets)
        .map(function (set) {
          return Math.pow(set.damage - this.metrics.avg, 2);
        }, this)
        .reduce(function (sum, sqv) {
          return sum + sqv;
        }, 0)
        .value() / this.sets.length - 1;

      this.metrics.sd = Math.sqrt(this.metrics.variance);
    }
    else {
      this.metrics.avg = this.metrics.min;
    }
  };

  State.prototype.buildGraphData = function () {
    var tCombos = this.sets.total;
    var grouped = this.sets.grouped;

    // Get a range of all possible values from the min score to the max score
    var range = _.range(this.metrics.min, this.metrics.max+1);

    // Iterate over the range, while subtracting the count of remaining combos
    // (rCombos) with the given score along the way.  This gives the probability
    // of each score being reached.  E.g say the possible scores are 
    // [10,15,15,20].  We iterate from 10-20, passing the total combo count
    // as rCombos.
    //
    // - score=10; rCombos=4 (total combo count)
    //   - rCombos/tCombos == 4/4, 100% chance
    // - score=11,12,13,14,15
    //   - rCombos/tCombos == 3/4, 75% chance
    // - score=16-20
    //   - rCombos/tCombos == 1/4, 25% chance
    //
    var data = _.reduce(range, function (o, score) {
      o.points.push({ x: score, y: o.rCombos/tCombos });
      o.rCombos -= grouped[score] ? grouped[score].count : 0;
      return o;
    }, {rCombos: tCombos, points: []});

    this.graphData = data.points.length
      ? [{ key: "Probability", values: data.points }]
      : [];
  };


  app.controller('IndexCtrl', ['$scope', function (scope) {
    scope.combinationCap = root.helpers.combinationCap;
    scope.murlocs = Murloc.murlocs;

    //
    // Board
    //
    
    scope.board = [];

    scope.onBoard = function () {
      return _.pluck(scope.board, 'murloc');
    };

    scope.boardDirty = function () {
      return !!scope.board.length;
    };

    scope.free = function () {
      return 7 - scope.board.length;
    };

    scope.addToBoard = function (card) {
      if (scope.free()) {
        scope.board.push( angular.copy(card) );
      }
    };

    scope.removeFromBoard = function (i) {
      scope.board.splice(i, 1);
    };

    scope.clearBoard = function () {
      scope.board = [];
    };

    scope.incrPower = function (index) {
      if (!scope.board[index]) return;
      scope.board[index].power += 1;
      scope.update();
    };

    scope.decrPower = function (index) {
      if (!scope.board[index]) return;
      scope.board[index].power = Math.max(scope.board[index].power - 1, 0);
      scope.update();
    };


    //
    // Opponent
    //

    scope.opponent = {
      w: 0,
      g: 0,
      o: 0
    };

    scope.opponentDirty = function () {
      return scope.opponent.w || scope.opponent.g || scope.opponent.o;
    };

    scope.clearOpponent = function () {
      scope.opponent.w = scope.opponent.g = scope.opponent.o = 0;
    };


    //
    // Graveyard
    //

    scope.graveyard = {
      m: 0,
      b: 0,
      w: 0,
      g: 0,
      o: 0
    };

    scope.graveyardDirty = function () {
      return scope.graveyard.m
          || scope.graveyard.b
          || scope.graveyard.w
          || scope.graveyard.g
          || scope.graveyard.o;
    };

    scope.clearGraveyard = function () {
      scope.graveyard.m = 
      scope.graveyard.b =
      scope.graveyard.w =
      scope.graveyard.g = 
      scope.graveyard.o = 0;
    };


    //
    // Combined
    //

    scope.dirty = function () {
      return scope.opponentDirty() 
        || scope.boardDirty() 
        || scope.graveyardDirty();
    };

    scope.clear = function () {
      scope.clearOpponent();
      scope.clearBoard();
      scope.clearGraveyard();
    };

    scope.update = function () {
      scope.state = new State(scope.board, scope.graveyard, scope.opponent);
      window.state = scope.state;
    };

    scope.deckOptions = {
      murlocs: scope.murlocs,
      cards: [
        { murloc: 'b' },
        { murloc: 'w' },
        { murloc: 'm' },
        { murloc: 'g' },
        { murloc: 't' },
        { murloc: 'o' },
        { name: 'Other Minion', 
          deckImg: 'assets/images/bars/recruit.png',
          cardImg: 'assets/images/cards/recruit.png'
        }
      ],
    };

    scope.graphOptions = {
      chart: {
        type: 'lineChart',
        height: 200,
        showLegend: false,
        x: function(d){ return d.x; },
        y: function(d){ return d.y; },
        useInteractiveGuideline: true,
        forceY: [0, 1],
        xAxis: {
          axisLabel: 'Damage',
          tickFormat: function (d) {
            return d;
          }
        },
        yAxis: {
          axisLabel: 'Probability',
          tickFormat: function(d) {
            return d3.format('.1%')(d);
          },
          axisLabelDistance: 0
        }
      }
    };

    // TODO these should all be in one watch if possible
    //
    scope.$watchGroup([
      'opponent.w', 
      'opponent.g', 
      'opponent.o'
    ], scope.update);

    scope.$watchGroup([
      'graveyard.m', 
      'graveyard.b', 
      'graveyard.w',
      'graveyard.g', 
      'graveyard.o'
    ], scope.update);

    scope.$watchCollection('board', scope.update);
  }]);


  app.directive('murlocCounters', [function () {
    return {
      restrict: 'A',
      scope: {
        model: '=murlocCounters',
        options: '='
      },

      link: function (scope, elem, attrs) {
        var options = scope.options || {};
        scope.max = options.max || 8;
        scope.imageSrc = function (id) {
          return Murloc.murlocs[id].cardImg;
        }
        scope.name = function (id) {
          return Murloc.murlocs[id].name;
        }
        scope.incr = function (id) {
          scope.model[id] += 1;
        }
        scope.decr = function (id) {
          scope.model[id] = Math.max(scope.model[id]-1, 0);
        }
      },

      template:
          '<li ng-repeat="(id, value) in model" class="card-minion" title="{{name(id)}}">'
        +   '<label class="card-minion-name">{{name(id)}}</label>'
        +   '<img ng-click="incr(id)" ng-right-click="decr(id)" ng-src="{{imageSrc(id)}}">'
        +   '<p class="card-minion-bar">'
        +     '<i class="fa fa-arrow-down" ng-click="decr(id)"></i>'
        +     '<span class="badge card-minion-badge card-minion-count" ng-bind="model[id]"></span>'
        +     '<i class="fa fa-arrow-up" ng-click="incr(id)"></i>'
        +   '</p>'
        +   '<label class="card-minion-label">Count</label>'
        + '</li>'
    };
  }]);

  app.directive('deck', [function () {
    return {
      restrict: 'E',
      scope: {
        onClear: '=',
        onSelect: '=',
        options: '=',
        board: '='
      },

      link: function (scope, elem, attrs) {
        scope.cards = angular.copy(scope.options.cards);

        _.each(scope.cards, function (card) {
          var murloc = card.murloc && scope.options.murlocs[card.murloc];
          if (murloc) {
            card.defaultPower = card.power = murloc.power;
            card.name = murloc.name;
            card.deckImg = murloc.deckImg;
            card.cardImg = murloc.cardImg;
          } else {
            card.power = 0;
          }
        });
      },

      template:
          '<div>'
        +   '<a ng-if="board.length" class="btn btn-default" ng-click="onClear()">Clear</a>'
        +   '<div class="deck">'
        +     '<button data-toggle="dropdown" type="button" class="dropdown-toggle btn btn-default" ng-disabled="disabled">'
        +       'Add a minion <span class="caret"></span>'
        +     '</button>'
        +     '<ul class="dropdown-menu" role="menu">'
        +       '<li class="deck-slot" ng-repeat="card in cards">'
        +         '<a ng-click="onSelect(card)" style="background-image: url({{card.deckImg}});">'
        +           '<span class="deck-slot-wrapper"><span>{{card.name}}</span></span>'
        +         '</a>'
        +       '</li>'
        +     '</ul>'
        +   '</div>'
        + '</div>'

    }
  }]);

  app.directive('ngRightClick', function ($parse) {
    return function(scope, element, attrs) {
      var fn = $parse(attrs.ngRightClick);

      element.bind('contextmenu', function (event) {
        scope.$apply(function () {
          event.preventDefault();
          fn(scope, {$event: event});
        });
      });
    };
  });

  root.helpers = {};
  root.helpers.combinationCap = 30000;

  root.helpers.combinations = (function () {
    var fn = function(n, src, got, all) {
      if (n == 0) {
        if (got.length > 0) {
          all[all.length] = got;
        }
        return;
      }
      for (var j = 0; j < src.length; j++) {
        fn(n - 1, src.slice(j + 1), got.concat([src[j]]), all);
        if (all.length >= root.helpers.combinationCap) {
          throw "Subset calculation cap reached";
        }
      }
      return;
    }

    return function (a, count) {
      var all = [], retv;

      if (count > a.length) {
        count = a.length;
      }

      try {
        fn(count, a, [], all);
      } catch (e) {
        all.exception = e;
      }

      return all;
    }
  })();

  root.helpers.sum = function (arr, prop) {
    return _.reduce(arr, function (mem, o) {
      return mem + o[prop];
    }, 0);
  };



})(window.root || (window.root = {}));
