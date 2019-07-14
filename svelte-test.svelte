<div class="figure" style="width: 600px;">
  <div class="outer" on:mouseover="set({pres_n: undefined})">
    <h1> TITLE STLK</h1>
    </div>
</div>


<style>
  
</style>

<script>

  import LayerCake from 'layercake';
        
  function range(n){
    return Array(n).fill().map((_, i) => i);
  }
  
  export default {
    data () {
      return {
        img: ""
      };
    },
    helpers: {range}
  };
</script>