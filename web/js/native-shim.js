/* Cầu nối cho bản Android (Capacitor): tải file / ảnh -> lưu vào bộ nhớ tạm rồi mở hộp thoại Chia sẻ của Android ("Lưu vào Tệp", gửi Zalo…).
   Trên trình duyệt thường file này không làm gì. */
(function(){
  var C=window.Capacitor;
  if(!C||!C.isNativePlatform||!C.isNativePlatform())return;
  var P=C.Plugins||{};
  function blobToB64(b){return new Promise(function(ok,no){var r=new FileReader();r.onload=function(){ok(String(r.result).split(',')[1]);};r.onerror=no;r.readAsDataURL(b);});}
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[download]');
    if(!a||!/^(blob:|data:)/.test(a.href))return;
    e.preventDefault();e.stopImmediatePropagation();
    var name=a.getAttribute('download')||'container3d';
    fetch(a.href).then(function(r){return r.blob();}).then(blobToB64).then(function(b64){
      return P.Filesystem.writeFile({path:name,data:b64,directory:'CACHE'});
    }).then(function(res){
      return P.Share.share({title:name,url:res.uri,dialogTitle:'Lưu / gửi file'});
    }).catch(function(err){ if(err&&/cancel/i.test(String(err.message||err)))return; alert('Không lưu được file: '+(err&&err.message||err)); });
  },true);
})();
