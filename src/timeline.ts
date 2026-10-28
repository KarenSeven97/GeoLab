import { Temporal } from '@js-temporal/polyfill';
import { Simulation, clockText, zoned } from './simulation.ts';
import { solarDay, solarPosition, seasonDates, type SolarDay, type SolarPosition } from './solar.ts';

export function createTimeline(model:Simulation,onChange:(sun:SolarPosition,day:SolarDay,changed:boolean)=>void) {
  const metrics=document.createElement('section');metrics.className='solar-panel';metrics.setAttribute('aria-label','太阳信息');
  metrics.innerHTML=`<div class="zone-row"><span id="zone-label"></span><details><summary aria-label="校正时区">时区</summary><div class="zone-editor"><label>时区名称 <input id="zone-input" list="zone-options" placeholder="America/New_York"></label><datalist id="zone-options"></datalist><button id="apply-zone">应用</button><button id="auto-zone">自动</button><p>边界附近自动识别可能有误，可手动校正。</p></div></details></div><div class="solar-grid">${[['sunrise','日出'],['noon','太阳正午'],['sunset','日落'],['daylight','昼长'],['altitude','太阳高度'],['azimuth','太阳方位']].map(([id,label])=>`<div><span>${label}</span><strong id="solar-${id}">—</strong></div>`).join('')}</div><div class="setting"><span>太阳轨迹</span><label class="switch"><input id="sun-path" type="checkbox" checked aria-label="显示太阳轨迹"><i></i></label></div><p id="sun-state" class="sun-state"></p>`;
  document.querySelector('.metrics')!.before(metrics);
  const panel=document.createElement('section');panel.className='timelines';panel.setAttribute('aria-label','模拟日期与时间');
  panel.innerHTML=`<div class="timeline-heading"><span>TIME LAB <b>光影随时间流动</b></span><button id="sim-now">现在</button></div><div class="timeline-row"><button class="play" id="play-year" aria-label="播放全年" aria-pressed="false" title="每 0.25 秒前进一天；保留当地时刻；到年末停止">▶</button><div class="axis-body"><div class="axis-caption"><label for="date-axis">日期 <small id="year-label"></small></label><input id="sim-date" type="date" min="1900-01-01" max="2100-12-31" aria-label="模拟日期"></div><input id="date-axis" type="range" min="0" step="1" aria-label="全年日期轴"><div id="month-ticks" class="axis-ticks"></div></div></div><div class="season-shortcuts" aria-label="节气快捷日期（北半球命名）">${['春分','夏至','秋分','冬至'].map((x,i)=>`<button data-season="${i}">${x}</button>`).join('')}<span>北半球节气 · 保留时刻</span></div><div class="timeline-row"><button class="play" id="play-day" aria-label="播放一天" aria-pressed="false" title="每 0.25 秒前进 10 分钟；到次日零点停止">▶</button><div class="axis-body"><div class="axis-caption"><label for="time-axis">当地时间 <small id="offset-label"></small></label><input id="sim-time" type="time" step="60" aria-label="模拟时刻"></div><div class="time-track"><input id="time-axis" type="range" min="0" step="1" aria-label="一天时间轴"><div id="event-markers" class="event-markers"></div></div><div id="hour-ticks" class="axis-ticks"></div></div></div><div class="timeline-bottom"><div class="event-jumps"><button id="jump-rise">日出</button><button id="jump-noon">正午</button><button id="jump-set">日落</button><label><input type="checkbox" id="show-markers" checked>标记</label></div><span id="day-length"></span></div><p id="time-notice" role="status"></p>`;
  document.querySelector('#app')!.append(panel);
  const get=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
  const input=(id:string)=>get<HTMLInputElement>(id);
  const set=(id:string,value:string)=>{get(id).textContent=value;};
  let mode:'year'|'day'|null=null,timer:ReturnType<typeof setInterval>|undefined,frame=0,lastKey='',day:SolarDay;
  let playbackEnd=0,playbackYear=0,dragDate:string|null=null;
  function pause(){mode=null;clearInterval(timer);for(const kind of ['year','day']){get(`play-${kind}`).textContent='▶';get(`play-${kind}`).setAttribute('aria-pressed','false');get(`play-${kind}`).setAttribute('aria-label',kind==='year'?'播放全年':'播放一天');}}
  function refresh(){cancelAnimationFrame(frame);frame=requestAnimationFrame(render);}
  function edit(action:()=>void){pause();try{action();refresh();}catch{set('time-notice','日期、时刻或时区无效，请检查输入。');}}
  function render() {
    const local=model.local,date=model.date;
    const key=`${date}/${model.zone}/${model.lat.toFixed(6)}/${model.lng.toFixed(6)}`;
    const changed=key!==lastKey;
    if(changed){day=solarDay(date,model.zone,model.lat,model.lng);lastKey=key;}
    const sun=solarPosition(model.instant,model.lat,model.lng);
    input('sim-date').value=date;input('sim-time').value=clockText(model.instant,model.zone);
    input('date-axis').max=String(local.daysInYear-1);input('date-axis').value=String(local.dayOfYear-1);
    input('time-axis').max=String(day.minutes);input('time-axis').value=String(model.minute);
    input('date-axis').setAttribute('aria-valuetext',date);
    input('time-axis').setAttribute('aria-valuetext',`${clockText(model.instant,model.zone)} UTC${local.offset}`);
    set('year-label',String(local.year));set('offset-label',`UTC${local.offset}`);set('zone-label',model.zone);
    if(document.activeElement!==input('zone-input'))input('zone-input').value=model.zone;
    set('solar-altitude',`${sun.altitude.toFixed(1)}°`);set('solar-azimuth',`${sun.azimuth.toFixed(0)}° ${['N','NE','E','SE','S','SW','W','NW'][Math.round(sun.azimuth/45)%8]}`);
    set('sun-state',sun.daylight?(sun.altitude<5?'低太阳高度 · 长阴影可能超出加载范围':'白昼 · 建筑与地面实时投影'):'夜间 · 太阳已在地平线以下，关闭太阳阴影');
    document.documentElement.dataset.night=String(!sun.daylight);
    set('time-notice',model.notice||(day.minutes!==1440?`时区切换日：实际 ${day.minutes/60} 小时；拖动按真实经过时间，重复时刻用 UTC 偏移区分。`:mode==='year'?'全年播放 · 保留当地时刻，年末停止':mode==='day'?'一天播放 · 到次日 00:00 停止':'阴影仅含已加载建筑 · 水平地面 · 00:00 → 次日 00:00'));
    if(changed) {
      const fmt=(ms:number|null)=>ms==null?'—':clockText(ms,model.zone);
      set('solar-sunrise',fmt(day.sunrise));set('solar-noon',fmt(day.noon));set('solar-sunset',fmt(day.sunset));
      const duration=Math.round(day.daylightMinutes);set('solar-daylight',day.polar||`${Math.floor(duration/60)}h ${duration%60}m`);
      set('day-length',`全天 ${day.minutes/60}h${day.polar?` · ${day.polar}`:''}`);
      get('month-ticks').replaceChildren();
      for(let m=1;m<=12;m++){const tick=document.createElement('span');tick.textContent=`${m}月`;tick.style.left=`${(Temporal.PlainDate.from({year:local.year,month:m,day:1}).dayOfYear-1)/(local.daysInYear-1)*100}%`;get('month-ticks').append(tick);}
      get('hour-ticks').replaceChildren();
      for(let hour=0;hour<=24;hour+=3){
        const ms=hour===24?day.end:hour===0?day.start:Temporal.PlainDate.from(date).toZonedDateTime({timeZone:model.zone,plainTime:{hour}}).epochMilliseconds;
        const z=zoned(ms,model.zone),t=document.createElement('span');
        t.textContent=hour===24?'24':z.minute?clockText(ms,model.zone):String(z.hour).padStart(2,'0');
        t.style.left=`${(ms-day.start)/(day.end-day.start)*100}%`;get('hour-ticks').append(t);
      }
      get('event-markers').replaceChildren();
      for(const [label,ms,id] of [['日出',day.sunrise,'jump-rise'],['正午',day.noon,'jump-noon'],['日落',day.sunset,'jump-set']] as const) {
        get<HTMLButtonElement>(id).disabled=ms==null;get(id).title=ms==null?`${label}未在本日发生`:`${label} ${fmt(ms)}`;
        if(ms!=null){const mark=document.createElement('i');mark.title=`${label} ${fmt(ms)}`;mark.style.left=`${(ms-day.start)/(day.end-day.start)*100}%`;get('event-markers').append(mark);}
      }
      const stops=Array.from({length:49},(_,i)=>{const altitude=solarPosition(day.start+(day.end-day.start)*i/48,model.lat,model.lng).altitude;return `${altitude>6?'#f4dd9a':altitude>0?'#f4c47d':altitude> -6?'#b79b9e':'#545b79'} ${i/48*100}%`;});
      input('time-axis').style.background=`linear-gradient(to right,${stops.join(',')})`;
      const dates=seasonDates(local.year,model.zone);panel.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b,i)=>{b.dataset.date=dates[i];b.title=`${dates[i]} · 保留当前当地时刻`;});
    }
    onChange(sun,day,changed);
    document.documentElement.dataset.simulation=JSON.stringify({instant:model.instant,date,time:clockText(model.instant,model.zone),zone:model.zone,offset:local.offset,dayMinutes:day.minutes,altitude:sun.altitude,azimuth:sun.azimuth,direction:sun.direction,mode});
  }
  input('sim-date').addEventListener('change',()=>edit(()=>{if(input('sim-date').value<'1900-01-01'||input('sim-date').value>'2100-12-31')throw Error();model.setDate(input('sim-date').value);}));
  input('sim-time').addEventListener('change',()=>edit(()=>model.setTime(input('sim-time').value)));
  for(const id of ['sim-date','sim-time','zone-input'])input(id).addEventListener('focus',pause);
  input('date-axis').addEventListener('input',()=>edit(()=>model.setDate(Temporal.PlainDate.from({year:model.local.year,month:1,day:1}).add({days:Number(input('date-axis').value)}).toString())));
  input('time-axis').addEventListener('pointerdown',()=>{dragDate=model.date;});
  input('time-axis').addEventListener('input',()=>edit(()=>model.setElapsed(Number(input('time-axis').value),dragDate||model.date)));
  const endDrag=()=>{dragDate=null;};window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
  panel.querySelectorAll<HTMLButtonElement>('[data-season]').forEach(b=>b.addEventListener('click',()=>edit(()=>model.setDate(b.dataset.date!))));
  get('sim-now').addEventListener('click',()=>edit(()=>model.now()));
  get('apply-zone').addEventListener('click',()=>edit(()=>model.setZone(input('zone-input').value.trim())));
  get('auto-zone').addEventListener('click',()=>edit(()=>model.resetZone()));
  for(const [id,key] of [['jump-rise','sunrise'],['jump-noon','noon'],['jump-set','sunset']] as const)get(id).addEventListener('click',()=>edit(()=>{if(day[key]!=null)model.instant=day[key]!;model.notice='';}));
  input('show-markers').addEventListener('change',()=>{get('event-markers').hidden=!input('show-markers').checked;});
  for(const kind of ['year','day'] as const)get(`play-${kind}`).addEventListener('click',()=>{
    const was=mode;pause();if(was===kind){refresh();return;}
    mode=kind;playbackEnd=model.bounds.end;playbackYear=model.local.year;
    get(`play-${kind}`).textContent='Ⅱ';get(`play-${kind}`).setAttribute('aria-pressed','true');get(`play-${kind}`).setAttribute('aria-label',kind==='year'?'暂停全年':'暂停一天');
    timer=setInterval(()=>{
      if(mode==='year'){if(model.local.dayOfYear===model.local.daysInYear||model.local.year!==playbackYear)pause();else model.addDay();}
      else if(mode==='day'){model.instant=Math.min(playbackEnd,model.instant+600000);if(model.instant===playbackEnd)pause();}
      refresh();
    },250);refresh();
  });
  const hide=()=>{if(document.hidden){pause();refresh();}};document.addEventListener('visibilitychange',hide);
  // Intl provides browser-supported IANA identifiers; Temporal validates manual values.
  const zones=(Intl as typeof Intl & {supportedValuesOf?:(key:string)=>string[]}).supportedValuesOf?.('timeZone')||[];
  for(const zone of zones){const o=document.createElement('option');o.value=zone;get('zone-options').append(o);}
  render();
  return {refresh,pause,destroy(){pause();cancelAnimationFrame(frame);window.removeEventListener('pointerup',endDrag);window.removeEventListener('pointercancel',endDrag);document.removeEventListener('visibilitychange',hide);}};
}
