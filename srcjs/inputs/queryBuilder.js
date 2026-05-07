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
// `optHtml` is captured once per filter; each rule's operator-change handler
// is namespaced and rebound on every factory invocation so we never
// accumulate stale handlers from previous filter selections on the same rule.
function _makeSelectOrTextInput(values) {
  var optHtml = _buildOptsHtml(values);

  function paintValueControl($valContainer, op, rule) {
    $valContainer.empty();
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
  }

  function factory(rule, _name) {
    var $opContainer = rule.$el.find(".rule-operator-container");
    var $valContainer = rule.$el.find(".rule-value-container");

    var initialOpEl = $opContainer.find("select")[0];
    paintValueControl(
      $valContainer,
      initialOpEl ? initialOpEl.value : "equal",
      rule
    );

    // Swap input type whenever the operator dropdown changes. The .off()
    // removes any previously-bound handler from a prior selectOrText filter
    // on this same rule. The identity check inside lets us self-unbind when
    // the user switches to a non-selectOrText filter (plain text/date/etc.),
    // so we don't repaint that filter's value control with stale options.
    $opContainer.off("change.selectOrText").on("change.selectOrText", function () {
      // If the rule's current filter isn't this exact factory, get out of the
      // way. Without this, a Gender->BirthCountry switch (BirthCountry is a
      // plain `text` filter) leaves Gender's handler bound, and clicking the
      // operator repaints BirthCountry's value control with Gender's options
      // (or a stale text input) — the originally-reported bug.
      if (!rule.filter || rule.filter.input !== factory) {
        $opContainer.off("change.selectOrText");
        return;
      }
      var sel = $opContainer.find("select")[0];
      if (!sel) return;
      paintValueControl($valContainer, sel.value, rule);
    });
  }

  return factory;
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
