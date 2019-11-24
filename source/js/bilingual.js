(function() {

    var leftParagraphs = document.querySelectorAll('.bil-first-column')[0].querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    var rightParagraphs = document.querySelectorAll('.bil-second-column')[0].querySelectorAll('p, h1, h2, h3, h4, h5, h6');

    var align = function() {
        /* 如果页面宽度大于 800px，进行段落对齐，见下一节 */
        if(window.matchMedia('(min-width: 768px)').matches) {
            leftParagraphs.forEach(function(thiz, i) {
                var left = thiz;
                var right = rightParagraphs[i];

                left.removeAttribute('style'), right.removeAttribute('style');

                /* 取对应两段高度的最大值 */
                var maxHeight = Math.max(left.offsetHeight, right.offsetHeight);
		left.style.height = maxHeight + 'px', right.style.height = maxHeight + 'px';
            });
        } else {
            leftParagraphs.forEach(function(thiz, i) {
                var left = thiz;
                var right = rightParagraphs[i];
                left.removeAttribute('style'), right.removeAttribute('style');
            });
        }
    }

    if(leftParagraphs.length == rightParagraphs.length) {
        var resizeHandler = 0;
        /* 监听窗口大小变化 */
        window.addEventListener('resize', function(event) {
            if(resizeHandler) {
                clearTimeout(resizeHandler);
            }
            resizeHandler = setTimeout(align, 50);
        });
	var images = document.querySelectorAll('.content img');
        if(images.length) {
            images.forEach(function(thiz, i) {
               if(!thiz.complete) {
                   thiz.addEventListener("load", align);
               }
	        });
        }
        document.addEventListener("DOMContentLoaded", align);
    }
})();
