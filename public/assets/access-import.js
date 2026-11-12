const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g,'');

const columnAliases={
  name:['nome','name','nomecompleto'],
  email:['email','correioeletronico'],
  role:['perfil','role','funcao'],
  tracks:['trilhas','tracks'],
  permissions:['permissoes','permissions','acessos'],
  supervisors:['supervisores','supervisor','supervisoremails','emailssupervisores'],
  sellers:['vendedores','seller','selleremails','emailsvendedores']
};

function detectDelimiter(header){
  let quoted=false,semicolons=0,commas=0;
  for(let index=0;index<header.length;index++){
    if(header[index]==='"'&&header[index+1]==='"'&&quoted){index++;continue;}
    if(header[index]==='"'){quoted=!quoted;continue;}
    if(!quoted&&header[index]===';')semicolons++;
    if(!quoted&&header[index]===',')commas++;
  }
  return semicolons>=commas?';':',';
}

function parseRecords(text,delimiter){
  const rows=[];let row=[],cell='',quoted=false;
  for(let index=0;index<text.length;index++){
    const character=text[index];
    if(quoted){
      if(character==='"'&&text[index+1]==='"'){cell+='"';index++;}
      else if(character==='"')quoted=false;
      else cell+=character;
      continue;
    }
    if(character==='"'){
      if(cell.trim())throw new Error('O CSV contém aspas em posição inválida.');
      quoted=true;
    }else if(character===delimiter){row.push(cell.trim());cell='';}
    else if(character==='\n'||character==='\r'){
      if(character==='\r'&&text[index+1]==='\n')index++;
      row.push(cell.trim());
      if(row.some(value=>value!==''))rows.push(row);
      row=[];cell='';
    }else cell+=character;
  }
  if(quoted)throw new Error('O CSV contém uma célula com aspas sem fechamento.');
  row.push(cell.trim());if(row.some(value=>value!==''))rows.push(row);
  return rows;
}

export function parseAccessCsv(source){
  const text=String(source??'').replace(/^\uFEFF/,'');
  if(!text.trim())throw new Error('O arquivo CSV está vazio.');
  const firstLine=text.split(/\r\n|\n|\r/,1)[0],delimiter=detectDelimiter(firstLine),records=parseRecords(text,delimiter);
  if(records.length<2)throw new Error('Inclua ao menos uma pessoa depois do cabeçalho.');
  if(records.length-1>100)throw new Error('O limite é de 100 pessoas por arquivo. Divida a lista em arquivos menores.');
  const headers=records[0].map(normalize),indices={};
  for(const [field,aliases] of Object.entries(columnAliases)){
    const matches=headers.map((header,index)=>aliases.includes(header)?index:-1).filter(index=>index>=0);
    if(matches.length>1)throw new Error(`O cabeçalho tem mais de uma coluna para ${field==='name'?'nome':field==='email'?'e-mail':field==='role'?'perfil':field}.`);
    if(matches.length)indices[field]=matches[0];
  }
  for(const field of ['name','email','role'])if(indices[field]===undefined)throw new Error('O cabeçalho precisa conter as colunas nome, email e perfil. Baixe o modelo ST1 e preencha-o.');
  const cell=(record,field)=>indices[field]===undefined?'':String(record[indices[field]]??'').trim();
  return records.slice(1).map((record,index)=>({
    rowNumber:index+2,
    name:cell(record,'name'),
    email:cell(record,'email').toLowerCase(),
    role:cell(record,'role'),
    tracks:cell(record,'tracks'),
    permissions:cell(record,'permissions'),
    supervisors:cell(record,'supervisors'),
    sellers:cell(record,'sellers')
  }));
}

const list=value=>value?value.split('|').map(item=>item.trim()).filter(Boolean):[];

export function validateAccessCsv(source,directory,tracks,permissionLabels){
  const rows=parseAccessCsv(source),trackMap=new Map(),permissionMap=new Map(),peopleByEmail=new Map();
  for(const track of tracks){trackMap.set(normalize(track.id),track.id);trackMap.set(normalize(track.name),track.id);}
  for(const [id,label] of Object.entries(permissionLabels)){permissionMap.set(normalize(id),id);permissionMap.set(normalize(label),id);}
  for(const person of directory.users)peopleByEmail.set(person.email.trim().toLowerCase(),person);
  const existingEmails=new Set(directory.users.map(person=>person.email.trim().toLowerCase()));
  for(const invitation of directory.invitations)if(invitation.status==='pending')existingEmails.add(invitation.email.trim().toLowerCase());
  const seenEmails=new Set();
  return rows.map(row=>{
    const errors=[],email=row.email.trim().toLowerCase(),name=row.name.trim(),roleText=normalize(row.role);
    const role=({seller:'seller',vendedor:'seller',vendedora:'seller',supervisor:'supervisor',supervisora:'supervisor',admin:'admin',administrador:'admin',administradora:'admin'})[roleText];
    if(name.length<3||name.length>80)errors.push('Nome: use de 3 a 80 caracteres.');
    if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push('E-mail inválido.');
    if(!role)errors.push('Perfil inválido: use Vendedor, Supervisor ou Admin.');
    if(seenEmails.has(email))errors.push('Este e-mail aparece mais de uma vez no arquivo.');
    seenEmails.add(email);
    if(email&&existingEmails.has(email))errors.push('Já existe uma conta ou convite pendente com este e-mail.');
    const tracksResult=list(row.tracks).map(value=>trackMap.get(normalize(value)));
    if(tracksResult.some(value=>!value))errors.push('Trilha inválida: use o ID ou nome informado no modelo.');
    const permissionsResult=list(row.permissions).map(value=>permissionMap.get(normalize(value)));
    if(permissionsResult.some(value=>!value))errors.push('Permissão inválida: use um ID ou nome reconhecido pela Academy.');
    if(role==='seller'&&permissionsResult.includes('team_results'))errors.push('Vendedor não pode receber a permissão team_results.');
    const resolvePeople=(value,expected,label)=>{
      const result=[];
      for(const rawEmail of list(value)){
        const person=peopleByEmail.get(rawEmail.toLowerCase());
        if(!person){errors.push(`${label}: não encontrei ${rawEmail} entre as contas atuais.`);continue;}
        if(person.role!==expected){errors.push(`${label}: ${rawEmail} não tem o perfil ${expected==='seller'?'Vendedor':'Supervisor'}.`);continue;}
        if(!result.includes(person.id))result.push(person.id);
      }
      return result;
    };
    const supervisorIds=resolvePeople(row.supervisors,'supervisor','Supervisores');
    const sellerIds=resolvePeople(row.sellers,'seller','Vendedores');
    if(role==='seller'&&sellerIds.length)errors.push('A coluna vendedores só se aplica a Supervisores.');
    if(role==='supervisor'&&supervisorIds.length)errors.push('A coluna supervisores só se aplica a Vendedores.');
    if(role==='admin'&&(supervisorIds.length||sellerIds.length))errors.push('Admins não recebem vínculo de equipe neste modelo.');
    return {rowNumber:row.rowNumber,name,email,role,tracks:tracksResult.filter(Boolean),permissions:permissionsResult.filter(Boolean),supervisorIds,sellerIds,errors};
  });
}

export function accessCsvTemplate(){return '\uFEFFnome;email;perfil;trilhas;permissoes;supervisores;vendedores\r\n';}
