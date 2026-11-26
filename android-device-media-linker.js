/* Ethvelle Android direct-device media linking.
 * Selected files stay in their original Android storage location. This bridge stores only a
 * small content-URI reference in Android SharedPreferences and uses the local HTTPS WebView
 * endpoint for on-demand byte-range playback. It never copies media into IndexedDB/localStorage
 * and never uploads selected files to Cloudinary.
 */
(function(){
  'use strict';
  if(window.__ethvelleNativeLinkBridgeV1)return;
  if(!window.EthvelleAndroid||typeof window.EthvelleAndroid.pickMedia!=='function')return;
  window.__ethvelleNativeLinkBridgeV1=true;
  var waiting=null;

  function notify(message,icon){
    try{
      if(typeof window.showToast==='function'){
        var opt={duration:2600};
        if(window.toastIcons&&window.toastIcons[icon||'check'])opt.icon=window.toastIcons[icon||'check'];
        window.showToast(message,opt);
      }else console.info('Ethvelle Android:',message);
    }catch(_e){console.info('Ethvelle Android:',message);}
  }
  function parse(raw){
    if(raw&&typeof raw==='object')return raw;
    try{return JSON.parse(String(raw||'{}'));}catch(_e){return {error:'Invalid response from Android media picker.'};}
  }
  window.__ethvelleNativePickerResolve=function(raw){
    var task=waiting;
    if(!task)return;
    waiting=null;
    task.resolve(parse(raw));
  };
  function requestNative(target){
    return new Promise(function(resolve,reject){
      if(waiting){reject(new Error('The device picker is already open.'));return;}
      waiting={resolve:resolve,reject:reject,target:target};
      try{window.EthvelleAndroid.pickMedia(String(target||'overlay'));}
      catch(err){waiting=null;reject(err);}
    });
  }
  function kindOf(item){
    var mime=String(item&&item.type||'').toLowerCase();
    var name=String(item&&item.name||'').toLowerCase();
    if(mime.indexOf('video/')===0||/\.(mp4|m4v|f4v|mov|webm|mkv|avi|3gp|3gpp|3g2|mpeg|mpg|mpe|m2v|ogv|ts|mts|m2ts|wmv|flv)$/i.test(name))return 'video';
    if(mime.indexOf('audio/')===0||/\.(mp3|m4a|aac|wav|ogg|opus|flac|aiff?)$/i.test(name))return 'audio';
    if(mime.indexOf('image/')===0||/\.(png|apng|jpe?g|jfif|webp|gif|avif|bmp|dib|heic|heif|tif|tiff|svg|ico|jxl)$/i.test(name))return 'image';
    return '';
  }
  function itemInfo(item){
    return {
      name:String(item.name||'Device media'),
      size:Number(item.size)||0,
      lastModified:Number(item.lastModified)||0
    };
  }
  function attachDeviceRef(model,item){
    var info=itemInfo(item);
    model.deviceMediaKey=String(item.key);
    model.deviceMediaName=info.name;
    model.deviceMediaSize=info.size||undefined;
    model.deviceMediaLastModified=info.lastModified||undefined;
  }
  function mediaDuration(item,kind){
    var n=Number(item.duration);
    if(Number.isFinite(n)&&n>0)return n;
    return kind==='image'?5:(kind==='audio'?3:12);
  }
  function refreshOverlay(){
    try{if(typeof renderOverlayLayers==='function')renderOverlayLayers();}catch(_e){}
    try{if(typeof renderOverlayListPanel==='function')renderOverlayListPanel();}catch(_e){}
    try{if(typeof renderFrame==='function')renderFrame();}catch(_e){}
    try{if(typeof persistProjectState==='function')persistProjectState();}catch(_e){}
  }
  async function linkOne(item,target,appendGroup,replaceId){
    var kind=kindOf(item);
    if(!kind)throw new Error('Choose an image, video, or audio file from your device.');
    if(!item.key||!item.url)throw new Error('Android did not return a persistent device-file reference.');
    if(target==='audio'&&kind!=='audio')throw new Error('Choose an audio file.');
    if((target==='background'||target==='replace-background')&&kind!=='image')throw new Error('Choose an image for the background.');
    if((target==='overlay'||target==='media')&&kind==='audio')throw new Error('Use the Audio tool to add an audio file.');

    var src=String(item.url);
    var name=String(item.name|| (kind==='video'?'Video':kind==='audio'?'Audio':'Image'));
    var duration=mediaDuration(item,kind);
    var width=Number(item.width)||0,height=Number(item.height)||0;
    var info=itemInfo(item);

    if(target==='background'){
      var bg=addBackgroundClip('url('+src+')');
      attachDeviceRef(bg,item);
      if(typeof persistProjectState==='function')persistProjectState();
      return;
    }

    if(target==='replace-background'){
      var bgTarget=(Array.isArray(backgrounds)?backgrounds:[]).find(function(x){return String(x.id)===String(replaceId);});
      if(!bgTarget)throw new Error('The selected background is no longer available.');
      bgTarget.src='url('+src+')';
      attachDeviceRef(bgTarget,item);
      try{if(typeof refreshCurrentBgFromPlayhead==='function')refreshCurrentBgFromPlayhead();}catch(_e){}
      try{if(typeof applyBackground==='function')applyBackground();}catch(_e){}
      try{if(typeof renderBackgroundTrack==='function')renderBackgroundTrack();}catch(_e){}
      if(typeof persistProjectState==='function')persistProjectState();
      return;
    }

    if(target==='replace-overlay'){
      var selected=(Array.isArray(overlays)?overlays:[]).find(function(x){return String(x.id)===String(replaceId);});
      if(!selected)throw new Error('The selected media clip is no longer available.');
      delete selected.ethvelleAssetEffect;
      selected.type=kind;
      selected.src=src;
      selected.name=name;
      selected.sourceDuration=duration;
      selected.sourceOffset=0;
      selected.sourceWidth=width;
      selected.sourceHeight=height;
      selected.thumbs=[];
      selected.peaks=[];
      attachDeviceRef(selected,item);
      if(kind==='audio')selected.transform=null;
      else if(!selected.transform)selected.transform={scale:1,offsetX:0,offsetY:0,rotation:0};
      if(kind==='video'||kind==='audio')selected.volume=selected.volume==null?1:selected.volume;
      else selected.volume=undefined;
      refreshOverlay();
      return;
    }

    if(typeof addMediaOverlay!=='function')throw new Error('The media timeline is not ready yet.');
    addMediaOverlay({
      type:kind,
      src:src,
      name:name,
      duration:duration,
      sourceDuration:duration,
      sourceOffset:0,
      sourceWidth:width,
      sourceHeight:height,
      thumbs:[],
      peaks:[],
      appendAfterGroup:appendGroup||null,
      deviceMediaKey:String(item.key),
      deviceMediaInfo:info
    });
  }

  async function runNativeImport(target,appendGroup,replaceId){
    try{
      var result=await requestNative(target);
      if(result.cancelled)return;
      if(result.error)throw new Error(result.error);
      var items=Array.isArray(result.items)?result.items:(result.item?[result.item]:[]);
      if(!items.length)return;
      if(String(target).indexOf('replace-')===0)items=items.slice(0,1);
      var linked=0,errors=[];
      for(var i=0;i<items.length;i++){
        if(i>0)await new Promise(function(resolve){setTimeout(resolve,12);});
        try{
          await linkOne(items[i],target,appendGroup,replaceId);
          linked++;
        }catch(err){errors.push(err&&err.message?err.message:'Could not link a selected file.');}
      }
      try{if(typeof closePanel==='function')closePanel();}catch(_e){}
      try{if(typeof window.__ethvelleDeviceSaveNow==='function')await window.__ethvelleDeviceSaveNow();}catch(err){console.warn('Ethvelle linked-media project save:',err);}
      if(linked){
        var message=linked===1?'Media linked from your device — no upload or copy.':linked+' media files linked from your device — no upload or copy.';
        if(errors.length)message+=' '+errors.length+' file(s) skipped.';
        notify(message,'check');
      }else notify(errors[0]||'No compatible media was selected.','info');
    }catch(err){
      console.error('Ethvelle Android native media link:',err);
      notify(err&&err.message?err.message:'Could not open device media.','info');
    }finally{
      try{if(typeof uploadAppendGroup!=='undefined')uploadAppendGroup=null;}catch(_e){}
      try{if(typeof replaceTargetId!=='undefined'&&String(target).indexOf('replace-')===0)replaceTargetId=null;}catch(_e){}
    }
  }

  var previous=window.triggerUpload;
  if(typeof previous==='function'&&!previous.__ethvelleNativeLinkV1){
    var wrapped=function(target,appendAfterGroup){
      var t=String(target||'');
      if(!['overlay','media','audio','background','replace-background','replace-overlay'].includes(t)){
        return previous.apply(this,arguments);
      }
      try{uploadTarget=t;uploadAppendGroup=appendAfterGroup||null;}catch(_e){}
      var replaceId=null;
      try{replaceId=replaceTargetId||null;}catch(_e){}
      runNativeImport(t,appendAfterGroup||null,replaceId);
      return;
    };
    wrapped.__ethvelleNativeLinkV1=true;
    window.triggerUpload=wrapped;
  }
  window.__ethvelleDeviceMediaMode='direct-link-no-copy';
})();
