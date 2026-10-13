import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {createApp} from '../server.mjs';
import {maxContentFileBytes} from '../lib/content.mjs';

test('Conteúdos exigem Admin para gestão e respeitam material, trilha, público e publicação em toda leitura',async t=>{
  const directory=await mkdtemp(resolve(tmpdir(),'st1-academy-content-test-')),baseURL='http://localhost:4188';
  let instance=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false});
  const listen=()=>new Promise(resolve=>{const server=instance.app.listen(4188,'127.0.0.1',()=>resolve(server));});let server=await listen();
  const clients={};
  const request=async(client,path,{method='GET',body,raw,headers={}}={})=>{
    const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Connection:'close',...(client?.cookie?{Cookie:client.cookie}:{}),...(raw?{'Content-Type':'application/octet-stream'}:body?{'Content-Type':'application/json'}:{}),...headers},...(raw?{body:raw}:body?{body:JSON.stringify(body)}:{})});
    const cookies=response.headers.getSetCookie();if(client&&cookies.length)client.cookie=cookies.filter(c=>!c.includes('Max-Age=0')).map(c=>c.split(';')[0]).join('; ');
    const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{}
    return {status:response.status,data,bytes,headers:response.headers};
  };
  for(const [name,role,tracks,permissions] of [['admin','admin',['pap']],['pap','seller',['pap']],['digital','seller',['digital']],['supervisor','supervisor',['pap']],['noMaterials','seller',['pap'],['assessments','conquests']]]){
    const invite=instance.ctx.createInvitation({name:'Teste de conteúdo '+name,email:name+'-content@example.test',role,tracks,permissions}),token=new URL(invite.url).searchParams.get('convite');clients[name]={cookie:''};
    assert.equal((await request(clients[name],'/api/auth/sign-up/email',{method:'POST',body:{name:'Teste',email:name+'-content@example.test',password:randomBytes(24).toString('base64url')},headers:{'x-academy-invite':token}})).status,200);
  }
  const pdf=await PDFDocument.create();pdf.addPage([300,300]).drawText('ST1 - CONTEUDO DE TESTE');const pdfBytes=Buffer.from(await pdf.save());
  let content;
  const upload=(id,revision,bytes=pdfBytes,name='Orientacao de teste.pdf',client=clients.admin)=>request(client,`/api/admin/contents/${id}/file`,{method:'POST',raw:bytes,headers:{'x-file-name':encodeURIComponent(name),'x-content-revision':String(revision)}});
  const update=body=>request(clients.admin,'/api/admin/contents/'+content.id,{method:'PATCH',body:{revision:content.revision,...body}});
  try{
    await t.test('anônimo, Vendedor e Supervisor não conseguem criar, alterar ou enviar arquivos',async()=>{
      assert.equal((await request(null,'/api/admin/contents')).status,401);
      for(const client of [clients.pap,clients.supervisor]){
        assert.equal((await request(client,'/api/admin/contents')).status,403);
        assert.equal((await request(client,'/api/admin/contents',{method:'POST',body:{role:'admin',title:'Não autorizado',kind:'text',tracks:['pap'],body:'Texto',status:'published'}})).status,403);
        assert.equal((await upload('inventado',0,pdfBytes,'teste.pdf',client)).status,403);
      }
    });
    await t.test('Admin cria rascunho, envia arquivo privado e só publica depois do envio',async()=>{
      const response=await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Orientação comercial PAP',summary:'Material de teste',kind:'file',tracks:['pap'],audience:['seller'],status:'draft'}});assert.equal(response.status,201);content=response.data;
      assert.equal((await update({status:'published'})).status,400);
      assert.equal((await request(clients.pap,'/api/contents/'+content.id)).status,404);
      const asset=await upload(content.id,content.revision);assert.equal(asset.status,201);content=asset.data;
      assert.equal(content.asset.sha256,createHash('sha256').update(pdfBytes).digest('hex'));
      assert.equal((await request(clients.pap,'/api/contents')).data.items.length,0);
      const published=await update({status:'published'});assert.equal(published.status,200);content=published.data;
    });
    await t.test('lista, detalhe e arquivo respeitam trilhas, públicos e permissão de materiais',async()=>{
      assert.equal((await request(clients.pap,'/api/contents')).data.items[0].id,content.id);
      assert.equal((await request(clients.digital,'/api/contents')).data.items.length,0);
      assert.equal((await request(clients.supervisor,'/api/contents')).data.items.length,0);
      assert.equal((await request(clients.noMaterials,'/api/contents')).status,403);
      for(const client of [clients.digital,clients.supervisor,clients.noMaterials])for(const suffix of ['','/file'])assert.equal((await request(client,'/api/contents/'+content.id+suffix)).status,404);
      assert.equal((await request(null,'/api/contents/'+content.id+'/file')).status,401);
      const file=await request(clients.pap,'/api/contents/'+content.id+'/file');assert.equal(file.status,200);assert.deepEqual(file.bytes,pdfBytes);assert.match(file.headers.get('content-type'),/application\/pdf/);assert.equal(file.headers.get('cache-control'),'no-store');assert.match(file.headers.get('content-disposition'),/inline/);
      const listing=(await request(clients.pap,'/api/contents')).data;assert.ok(!JSON.stringify(listing).includes('"bytes"'));assert.ok(!JSON.stringify(listing).includes('assetVersions'));
    });
    await t.test('formatos falsos, nomes com caminho, arquivo grande e edição desatualizada são recusados',async()=>{
      assert.equal((await upload(content.id,content.revision,Buffer.from('<html><script>bad</script></html>'),'arquivo.pdf')).status,400);
      assert.equal((await upload(content.id,content.revision,pdfBytes,'../../arquivo.pdf')).status,400);
      assert.equal((await upload(content.id,content.revision,Buffer.alloc(maxContentFileBytes+1),'grande.pdf')).status,413);
      assert.equal((await request(clients.admin,'/api/admin/contents/'+content.id,{method:'PATCH',body:{revision:content.revision-1,title:'Alteração desatualizada'}})).status,409);
      assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_content_asset').get().n,1);
    });
    await t.test('trocar o arquivo preserva versões e permite restaurar a versão original',async()=>{
      const original=content.asset.id,newPdf=Buffer.from('%PDF-1.7\nArquivo de teste da segunda versao\n%%EOF');
      const response=await upload(content.id,content.revision,newPdf,'Segunda versao.pdf');assert.equal(response.status,201);content=response.data;assert.equal(content.assetVersions.length,2);
      assert.deepEqual((await request(clients.pap,'/api/contents/'+content.id+'/file')).bytes,newPdf);
      const restored=await update({assetId:original});assert.equal(restored.status,200);content=restored.data;assert.deepEqual((await request(clients.pap,'/api/contents/'+content.id+'/file')).bytes,pdfBytes);
      const another=(await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Outro arquivo de teste',kind:'file',tracks:['pap']}})).data;
      assert.equal((await request(clients.admin,'/api/admin/contents/'+another.id,{method:'PATCH',body:{revision:0,assetId:original}})).status,400);
    });
    await t.test('arquivar remove a leitura imediatamente e voltar a publicar preserva o arquivo',async()=>{
      content=(await update({status:'archived'})).data;assert.equal((await request(clients.pap,'/api/contents/'+content.id+'/file')).status,404);assert.equal((await request(clients.pap,'/api/contents')).data.items.length,0);
      assert.equal((await request(clients.admin,'/api/admin/contents/'+content.id)).status,200);
      content=(await update({status:'published',audience:['seller','supervisor']})).data;assert.equal((await request(clients.supervisor,'/api/contents/'+content.id+'/file')).status,200);
    });
    await t.test('textos, links e conteúdos só para Admin usam o mesmo controle de publicação',async()=>{
      const text=await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Texto de orientação',kind:'text',body:'Treinamento <script>não executar</script>',tracks:['pap'],audience:['seller'],status:'published'}});assert.equal(text.status,201);assert.equal((await request(clients.pap,'/api/contents/'+text.data.id)).data.body,'Treinamento <script>não executar</script>');
      for(const url of ['javascript:alert(1)','http://example.test','https://user:secret@example.test'])assert.equal((await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Link inválido',kind:'link',url,tracks:['pap'],status:'published'}})).status,400);
      const internal=await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Orientação para Admin',kind:'link',url:'https://example.test/aula',tracks:['pap'],audience:[],status:'published'}});assert.equal(internal.status,201);assert.equal((await request(clients.pap,'/api/contents/'+internal.data.id)).status,404);
      assert.equal((await request(clients.admin,'/api/admin/contents',{method:'POST',body:{title:'Trilha inválida',kind:'text',body:'Texto',tracks:['inventada']}})).status,400);
    });
    await t.test('revogar a trilha ou bloquear a conta também bloqueia URLs diretas do arquivo',async()=>{
      const profile=(await request(clients.pap,'/api/me')).data;
      instance.ctx.access.updateMember((await request(clients.admin,'/api/me')).data.id,profile.id,{role:'seller',tracks:['digital']});assert.equal((await request(clients.pap,'/api/contents/'+content.id+'/file')).status,404);
      instance.ctx.access.updateMember((await request(clients.admin,'/api/me')).data.id,profile.id,{role:'seller',tracks:['pap'],enabled:false});assert.equal((await request(clients.pap,'/api/contents/'+content.id+'/file')).status,403);
    });
    await t.test('arquivos, versões e auditoria persistem no reinício sem criar aprovações ou certificados',async()=>{
      await new Promise(resolve=>server.close(resolve));instance.ctx.db.close();instance=await createApp({dataDir:directory,baseURL,testMode:true,includeLibrary:false});server=await listen();
      const response=await request(clients.admin,'/api/admin/contents/'+content.id);assert.equal(response.status,200);assert.equal(response.data.assetVersions.length,2);assert.deepEqual((await request(clients.admin,'/api/contents/'+content.id+'/file')).bytes,pdfBytes);
      assert.ok(instance.ctx.db.prepare("SELECT count(*) n FROM academy_access_audit WHERE action LIKE 'content.%'").get().n>=8);
      assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_certificate').get().n,0);assert.equal(instance.ctx.db.prepare('SELECT count(*) n FROM academy_outbox').get().n,0);
    });
  }finally{await new Promise(resolve=>server.close(resolve));instance.ctx.db.close();assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('st1-academy-content-test-'));await rm(directory,{recursive:true,force:true});}
});
