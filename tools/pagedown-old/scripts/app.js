angular.module('MarkdownModule', [])
    .directive('pagedown', function () {
        return {
            restrict: 'E',
            template:
                '<div id="wmd-button-bar"></div>' +
                '<textarea class="wmd-input" id="wmd-input" rows="20" cols="80"></textarea>' +
                '<div id="wmd-preview"></div>',
            link: function () {
                Object.prototype.tooltip = function () { }
                var converter = Markdown.getSanitizingConverter();
                var editor = new Markdown.Editor(converter);
                editor.run();
            }
        };
    });
