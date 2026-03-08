import $ from "jquery";
import "shiny";

const _escapeHtml = (unsafe) => {
  return unsafe
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
};

// Operators that use a <select> dropdown vs. a free-text <input>.
// Mirrors the lists in custom_input() on the R side.
const _SELECT_OPS = ["equal", "not_equal"];
const _TEXT_OPS = [
  "begins_with",
  "not_begins_with",
  "contains",
  "not_contains",
  "ends_with",
  "not_ends_with",
];

// Build the <option> fragment once per filter (not per rule).
function _buildOptsHtml(values) {
  var html = '<option value="" disabled selected>Choose value</option>';
  Object.keys(values).forEach(function (k) {
    html += '<option value="' + k + '">' + values[k] + "</option>";
  });
  return html;
}

// Returns a QueryBuilder input factory function that shows a <select> for
// equal/not_equal operators and a plain text <input> for text operators.
// The returned function closes over `optHtml` built once from filter.values,
// so the options string is never eval'd and is only constructed once.
function _makeSelectOrTextInput(values) {
  var optHtml = _buildOptsHtml(values);

  return function (rule, _name) {
    var $opContainer = rule.$el.find(".rule-operator-container");
    var $valContainer = rule.$el.find(".rule-value-container");
    var opSelect = $opContainer.find("select")[0];

    // Initial input: a <select> (equal is the default operator).
    var $init = $(
      '<select class="form-control">' + optHtml + "</select>"
    );
    $valContainer.append($init);
    $init.on("change", function () {
      rule.value = $(this).val();
      rule.$el.trigger("change");
    });

    // Swap input type whenever the operator dropdown changes.
    $opContainer.on("change", opSelect, function () {
      $valContainer.empty();
      var op = opSelect.value;
      if (_SELECT_OPS.includes(op)) {
        var $sel = $(
          '<select class="form-control">' + optHtml + "</select>"
        );
        $valContainer.append($sel);
        $sel.on("change", function () {
          rule.value = $(this).val();
          rule.$el.trigger("change");
        });
      } else if (_TEXT_OPS.includes(op)) {
        var $inp = $(
          '<input type="text" class="form-control" placeholder="Type text...">'
        );
        $valContainer.append($inp);
        $inp.on("input", function () {
          rule.value = $(this).val();
          rule.$el.trigger("change");
        });
      }
    });
  };
}

var queryBuilderBinding = new Shiny.InputBinding();

$.extend(queryBuilderBinding, {
  find: (scope) => {
    return $(scope).find(".queryBuilderBinding");
  },
  getType: function (el) {
    let return_type = $(el).attr("data-return");
    if (return_type === "r_rules") {
      return "jqbr.r_rules";
    }
    if (return_type === "rules") {
      return "jqbr.rules";
    }
    if (return_type === "sql") {
      return "jqbr.sql_rules";
    }
    if (return_type === "all") {
      return "jqbr.all";
    }
  },
  initialize: (el) => {
    var element = document.getElementById(el.id);
    var options = element.querySelector('script[data-for="' + el.id + '"]');
    var parsedOptions = JSON.parse(options.innerHTML, function (_key, value) {
      // Legacy: eval function strings for backward compatibility.
      if (typeof value === "string" && value.startsWith("function(")) {
        value = _escapeHtml(value);
        return (0, eval)("(" + value + ")");
      }
      // New: convert "selectOrText" marker to a factory function.
      // Uses filter.values (already in the JSON) — no eval needed.
      return value;
    });

    // Replace "selectOrText" input markers with real factory functions.
    // This runs after the full JSON is parsed so filter.values is available.
    if (parsedOptions.filters) {
      parsedOptions.filters = parsedOptions.filters.map(function (filter) {
        if (filter.input === "selectOrText") {
          filter.input = _makeSelectOrTextInput(filter.values || {});
        }
        return filter;
      });
    }

    $("#" + el.id).queryBuilder(parsedOptions);
  },
  getValue: (el) => {
    let return_type = $(el).attr("data-return");

    var rules = $("#" + el.id).queryBuilder("getRules");
    var valid = $("#" + el.id).queryBuilder("validate");

    Shiny.setInputValue(el.id + "_valid", valid);

    if (return_type === "r_rules" || return_type === "rules") {
      return { rules: rules };
    } else if (return_type === "sql_rules" || return_type === "all") {
      var sql_rules = $("#" + el.id).queryBuilder("getSQL");

      return { rules: rules, sql_rules: sql_rules };
    }
  },
  setValue: (el, value) => {
    // Remove all filters and replace with new ones
    if (value.setFilters != null) {
      $("#" + el.id).queryBuilder("setFilters", true, value.setFilters);
    }
    if (value.addFilter != null) {
      if (value.addFilter.position == null) {
        value.addFilter.position = "end";
      }
      $("#" + el.id).queryBuilder(
        "addFilter",
        value.addFilter.filter,
        value.addFilter.position
      );
    }
    // Update queryBuilder with a set of rules
    if (value.setRules != null) {
      $("#" + el.id).queryBuilder("setRules", value.setRules);
    }
    // destory queryBuilder
    if (value.destory) {
      $("#" + el.id).queryBuilder("destory");
    }
    // reset queryBuilder
    if (value.reset) {
      $("#" + el.id).queryBuilder("reset");
    }
  },
  subscribe: (el, callback) => {
    $(el).on(
      `
     afterMove.queryBuilder
     afterSetRules.queryBuilder
     afterCreateRuleInput.queryBuidler
     afterInit.queryBuilder
     afterDeleteGroup.queryBuilder
     afterDeleteRule.queryBuilder
     afterUpdateRuleValue.queryBuilder
     afterUpdateRuleFilter.queryBuilder
     afterUpdateRuleOperator.queryBuilder
     afterUpdateGroupCondition.queryBuilder
     `,
      function (_e) {
        callback();
      }
    );
  },
  unsubscribe: (el) => {
    $(el).off(".queryBuilderBinding");
  },
  receiveMessage: function (el, data) {
    this.setValue(el, data);
    // other parameters to update...
  },
});

Shiny.inputBindings.register(queryBuilderBinding, "jqbr.queryBuilderBinding");
