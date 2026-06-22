/* eslint-disable */
const IV = new Uint32Array([0x6A09E667,0xBB67AE85,0x3C6EF372,0xA54FF53A,0x510E527F,0x9B05688C,0x1F83D9AB,0x5BE0CD19]);
const MSG_PERM = [2,6,3,10,7,0,4,13,1,11,12,5,9,14,15,8];
const CHUNK_START = 1, CHUNK_END = 2, PARENT = 4, ROOT = 8;
function rotr(x,n){return ((x>>>n)|(x<<(32-n)))>>>0}
function add(a,b){return (a+b)>>>0}
function g(v,a,b,c,d,x,y){v[a]=add(add(v[a],v[b]),x);v[d]=rotr(v[d]^v[a],16);v[c]=add(v[c],v[d]);v[b]=rotr(v[b]^v[c],12);v[a]=add(add(v[a],v[b]),y);v[d]=rotr(v[d]^v[a],8);v[c]=add(v[c],v[d]);v[b]=rotr(v[b]^v[c],7)}
function wordsLE(bytes){const w=new Uint32Array(16);for(let i=0;i<16;i++){const j=i*4;w[i]=((bytes[j]||0)|((bytes[j+1]||0)<<8)|((bytes[j+2]||0)<<16)|((bytes[j+3]||0)<<24))>>>0}return w}
function compress(cv, blockWords, counter, blockLen, flags, outBytes=false){const v=new Uint32Array(16);v.set(cv,0);v.set(IV,8);v[12]=counter>>>0;v[13]=Math.floor(counter/0x100000000)>>>0;v[14]=blockLen>>>0;v[15]=flags>>>0;let m=Array.from(blockWords);for(let r=0;r<7;r++){g(v,0,4,8,12,m[0],m[1]);g(v,1,5,9,13,m[2],m[3]);g(v,2,6,10,14,m[4],m[5]);g(v,3,7,11,15,m[6],m[7]);g(v,0,5,10,15,m[8],m[9]);g(v,1,6,11,12,m[10],m[11]);g(v,2,7,8,13,m[12],m[13]);g(v,3,4,9,14,m[14],m[15]);m=MSG_PERM.map(i=>m[i]);}
 const out=new Uint8Array(32);for(let i=0;i<8;i++){const x=(v[i]^v[i+8])>>>0;out[i*4]=x&255;out[i*4+1]=(x>>>8)&255;out[i*4+2]=(x>>>16)&255;out[i*4+3]=(x>>>24)&255;}return out;}
function bytes(input){return input instanceof Uint8Array?input:Buffer.from(input)}
function hex(bytes){return Buffer.from(bytes).toString('hex')}
function cvFromBytes(b){return wordsLE(b).slice(0,8)}
function blake3Bytes(input){input=bytes(input);let cv=IV;let offset=0;let block=0;if(input.length===0){return compress(cv,wordsLE(new Uint8Array(64)),0,0,CHUNK_START|CHUNK_END|ROOT,true)}while(offset<input.length){const len=Math.min(64,input.length-offset);const b=new Uint8Array(64);b.set(input.subarray(offset,offset+len));let flags=0;if(block===0)flags|=CHUNK_START;const last=offset+len>=input.length;if(last)flags|=CHUNK_END|ROOT;const out=compress(cv,wordsLE(b),0,len,flags,true);if(last)return out;cv=cvFromBytes(out);offset+=len;block++;}return new Uint8Array(32);}
function blake3Hex(input){return hex(blake3Bytes(input))}
function prefixedBlake3(input){return 'blake3:'+blake3Hex(input)}
function hashToBytes(h){const hexstr=h.replace(/^(blake3|sha256|blake3-merkle-v1):/,'');return Buffer.from(hexstr,'hex')}
function merkleRoot(eventHashes){let nodes=eventHashes.map((h,i)=>blake3Bytes(Buffer.concat([Buffer.from('AGENTLOCK-LEAF-v1\0'),Buffer.from(String(i).padStart(16,'0')),Buffer.from([0]),hashToBytes(h)])));
 if(nodes.length===0)return 'blake3-merkle-v1:'+blake3Hex('AGENOMIC-EMPTY-v1\0');
 while(nodes.length>1){const next=[];for(let i=0;i<nodes.length;i+=2){const left=nodes[i];const right=nodes[i+1]||nodes[i];next.push(blake3Bytes(Buffer.concat([Buffer.from('AGENTLOCK-NODE-v1\0'),Buffer.from(left),Buffer.from(right)])));}nodes=next;}
 return 'blake3-merkle-v1:'+hex(nodes[0]);}
function canonicalJson(value){if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';if(value&&typeof value==='object'){return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';}return JSON.stringify(value);}
function eventHash(eventWithoutHash){return prefixedBlake3(canonicalJson(eventWithoutHash)+eventWithoutHash.prev_event_hash)}
module.exports={blake3Hex,prefixedBlake3,canonicalJson,eventHash,merkleRoot};
