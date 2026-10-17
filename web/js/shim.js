/* Thay cho các API của bản PC (Electron): dbAPI (lưu bảng dữ liệu), authAPI (quyền), không có đồng bộ điện thoại.
   Dữ liệu lưu trong IndexedDB của app trên máy; nếu IndexedDB không dùng được thì rơi về localStorage. */
(function(){
  'use strict';
  var DBN='container3d', ST='sheets', idb=null;
  function open(){
    if(idb)return idb;
    idb=new Promise(function(ok,no){
      try{
        var r=indexedDB.open(DBN,1);
        r.onupgradeneeded=function(){r.result.createObjectStore(ST);};
        r.onsuccess=function(){ok(r.result);};
        r.onerror=function(){no(r.error);};
      }catch(e){no(e);}
    });
    return idb;
  }
  function key(db,name){return String(db)+'::'+String(name);}
  function idbGet(k){return open().then(function(d){return new Promise(function(ok,no){var q=d.transaction(ST).objectStore(ST).get(k);q.onsuccess=function(){ok(q.result);};q.onerror=function(){no(q.error);};});});}
  function idbPut(k,v){return open().then(function(d){return new Promise(function(ok,no){var t=d.transaction(ST,'readwrite');t.objectStore(ST).put(v,k);t.oncomplete=ok;t.onerror=function(){no(t.error);};});});}
  function lsGet(k){try{return JSON.parse(localStorage.getItem('c3d:'+k)||'null');}catch(e){return null;}}
  function lsPut(k,v){localStorage.setItem('c3d:'+k,JSON.stringify(v));}
  window.dbAPI={
    readSheet:function(db,name){
      var k=key(db,name);
      return idbGet(k).then(function(v){return {ok:true,data:Array.isArray(v)?v:[]};})
        .catch(function(){var v=lsGet(k);return {ok:true,data:Array.isArray(v)?v:[]};});
    },
    writeSheets:function(db,obj){
      return Promise.all(Object.keys(obj||{}).map(function(n){
        var k=key(db,n),v=obj[n];
        return idbPut(k,v).catch(function(){lsPut(k,v);});
      })).then(function(){return {ok:true};}).catch(function(e){return {ok:false,error:String(e&&e.message||e)};});
    }
  };
  window.authAPI={state:function(){return Promise.resolve({ok:true,user:{canWrite:true,canExport:true,ten:''}});}};
})();
