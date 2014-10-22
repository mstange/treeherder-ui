/* From: http://stackoverflow.com/a/22253161/295132 (author: Mario Campa) */
angular.module('mc.resizer', []).directive('resizer', function($document) {
    return function($scope, $element, $attrs) {
        $element.on('mousedown', function(event) {
            event.preventDefault();
            $document.on('mousemove', mousemove);
            $document.on('mouseup', mouseup);
        });

        // the size last time this was called.  If it doesn't change,
        // we should not modify the height/width value.  That can mess with
        // scrollbars, etc.
        var lastOffset;

        function mousemove(event) {
            if ($attrs.resizer == 'vertical') {
                // Handle vertical resizer
                var x = event.pageX;
                if ($attrs.resizerMax && x > $attrs.resizerMax) {
                    x = parseInt($attrs.resizerMax);
                }
                $element.css({
                    left: x + 'px'
                });
                $($attrs.resizerLeft).css({
                    width: x + 'px'
                });
                $($attrs.resizerRight).css({
                    left: (x + parseInt($attrs.resizerWidth)) + 'px'
                });
            } else {
                // Handle horizontal resizer
                var container, y, relY;
                if ($attrs.resizerContainer) {
                    // a resizer that is in a container other than the
                    // whole window
                    container = $($attrs.resizerContainer);
                    relY = event.pageY - container.offset().top;
                } else {
                    // this is a resizer for two elements of the whole window.
                    container = $(window);
                    relY = event.pageY;
                }
                y = container.innerHeight() - relY;

                var top = $($attrs.resizerTop),
                    bottom = $($attrs.resizerBottom),
                    oldEl = $element.css("bottom"),
                    oldTop = top.css("bottom"),
                    oldBottom = bottom.css("height");

                // set the elements to their new values
                $element.css({bottom: y + 'px'});
                top.css({bottom: (y + parseInt($attrs.resizerHeight)) + 'px'});
                bottom.css({height: y + 'px'});

                var newOffset = $($element).offset().top;
                // if, after setting to the new values, the offset of the
                // resizer doesn't actually change, then we want to revert
                // the height.  Having the height set to something it isn't
                // able to be will mess with scrollbars.
                if (newOffset !== lastOffset) {
                    lastOffset = newOffset;
                } else {
                    $element.css({bottom: oldEl});
                    top.css({bottom: oldTop});
                    bottom.css({height: oldBottom});
                }
            }
        }
        function mouseup() {
            $document.unbind('mousemove', mousemove);
            $document.unbind('mouseup', mouseup);
        }
    };
});
