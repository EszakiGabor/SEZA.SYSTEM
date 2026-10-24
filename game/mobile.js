// Keep the game inside the actual visible viewport when mobile browser bars expand/collapse.
(function(){
  const root=document.documentElement;
  function size(){const v=window.visualViewport;
    root.style.setProperty('--bailong-vh',Math.round(v?v.height:window.innerHeight)+'px');
  }
  size();window.addEventListener('resize',size,{passive:true});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',size,{passive:true});
})();
