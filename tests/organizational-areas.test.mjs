import test from 'node:test';
import assert from 'node:assert/strict';
import {organizationalAreas,findOrganizationalArea,findDepartment,isValidOrganizationalAssignment} from '../content/organizational-areas.mjs';

test('catálogo contém as 18 áreas organizacionais com IDs únicos e especialidades ativas',()=>{
  assert.equal(organizationalAreas.length,18);
  assert.equal(new Set(organizationalAreas.map(area=>area.id)).size,18);
  assert.deepEqual(organizationalAreas.map(area=>area.order),Array.from({length:18},(_,i)=>i+1));
  for(const area of organizationalAreas){
    assert.ok(area.name);
    assert.equal(area.active,true);
    assert.ok(area.departments.length>0);
    assert.equal(new Set(area.departments.map(dept=>dept.id)).size,area.departments.length);
    for(const department of area.departments){
      assert.equal(department.active,true);
      assert.ok(department.name);
      assert.ok(department.id.startsWith(area.id+':'));
      assert.equal(findDepartment(area.id,department.id)?.name,department.name);
      assert.equal(isValidOrganizationalAssignment(area.id,department.id),true);
    }
  }
});

test('hierarquia organizacional não concede permissões e rejeita setor inválido',()=>{
  assert.equal(findOrganizationalArea('comercial')?.name,'Comercial');
  assert.equal(isValidOrganizationalAssignment('comercial','marketing:trafego-pago'),false);
  assert.equal(isValidOrganizationalAssignment('inexistente','qualquer'),false);
  assert.equal(findDepartment('comercial','inexistente'),null);
  assert.ok(!organizationalAreas.some(area=>'permissions' in area||'tracks' in area));
});
