const toggle=document.querySelector('.theme-toggle');
const saved=localStorage.getItem('rivlet-theme');
if(saved==='dark')document.body.classList.add('dark');
toggle?.addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('rivlet-theme',document.body.classList.contains('dark')?'dark':'light')});

const nav=document.querySelector('.nav');
const updateNav=()=>nav?.classList.toggle('scrolled',window.scrollY>8);
updateNav();
addEventListener('scroll',updateNav,{passive:true});
