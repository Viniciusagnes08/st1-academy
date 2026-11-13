// Catálogo organizacional inicial aprovado para a ST1 Academy.
// Setores identificam a lotação organizacional; NÃO concedem permissões ou trilhas.
// IDs são estáveis para referências futuras; desativar em vez de apagar com vínculos.
export const organizationalAreas = Object.freeze([
  {
    "id": "diretoria-gestao",
    "name": "Diretoria e Gestão",
    "order": 1,
    "active": true,
    "departments": [
      {
        "id": "diretoria-gestao:presidencia",
        "name": "Presidência",
        "active": true
      },
      {
        "id": "diretoria-gestao:diretoria",
        "name": "Diretoria",
        "active": true
      },
      {
        "id": "diretoria-gestao:gerencia",
        "name": "Gerência",
        "active": true
      },
      {
        "id": "diretoria-gestao:coordenacao",
        "name": "Coordenação",
        "active": true
      },
      {
        "id": "diretoria-gestao:supervisao",
        "name": "Supervisão",
        "active": true
      }
    ]
  },
  {
    "id": "planejamento-estrategia",
    "name": "Planejamento e Estratégia",
    "order": 2,
    "active": true,
    "departments": [
      {
        "id": "planejamento-estrategia:planejamento-estrategico",
        "name": "Planejamento Estratégico",
        "active": true
      },
      {
        "id": "planejamento-estrategia:gestao-de-performance",
        "name": "Gestão de Performance",
        "active": true
      },
      {
        "id": "planejamento-estrategia:pmo",
        "name": "PMO",
        "active": true
      },
      {
        "id": "planejamento-estrategia:projetos",
        "name": "Projetos",
        "active": true
      },
      {
        "id": "planejamento-estrategia:processos",
        "name": "Processos",
        "active": true
      }
    ]
  },
  {
    "id": "comercial",
    "name": "Comercial",
    "order": 3,
    "active": true,
    "departments": [
      {
        "id": "comercial:pap",
        "name": "PAP",
        "active": true
      },
      {
        "id": "comercial:digital",
        "name": "Digital",
        "active": true
      },
      {
        "id": "comercial:indoor",
        "name": "Indoor",
        "active": true
      },
      {
        "id": "comercial:pme",
        "name": "PME",
        "active": true
      },
      {
        "id": "comercial:corporativo",
        "name": "Corporativo",
        "active": true
      },
      {
        "id": "comercial:lojas",
        "name": "Lojas",
        "active": true
      },
      {
        "id": "comercial:televendas",
        "name": "Televendas",
        "active": true
      },
      {
        "id": "comercial:parcerias",
        "name": "Parcerias",
        "active": true
      }
    ]
  },
  {
    "id": "marketing",
    "name": "Marketing",
    "order": 4,
    "active": true,
    "departments": [
      {
        "id": "marketing:trade-marketing",
        "name": "Trade Marketing",
        "active": true
      },
      {
        "id": "marketing:trafego-pago",
        "name": "Tráfego Pago",
        "active": true
      },
      {
        "id": "marketing:design",
        "name": "Design",
        "active": true
      },
      {
        "id": "marketing:social-media",
        "name": "Social Media",
        "active": true
      },
      {
        "id": "marketing:branding",
        "name": "Branding",
        "active": true
      },
      {
        "id": "marketing:eventos",
        "name": "Eventos",
        "active": true
      },
      {
        "id": "marketing:crm-marketing",
        "name": "CRM Marketing",
        "active": true
      }
    ]
  },
  {
    "id": "atendimento",
    "name": "Atendimento",
    "order": 5,
    "active": true,
    "departments": [
      {
        "id": "atendimento:sac",
        "name": "SAC",
        "active": true
      },
      {
        "id": "atendimento:atendimento-digital",
        "name": "Atendimento Digital",
        "active": true
      },
      {
        "id": "atendimento:atendimento-telefonico",
        "name": "Atendimento Telefônico",
        "active": true
      },
      {
        "id": "atendimento:ouvidoria",
        "name": "Ouvidoria",
        "active": true
      },
      {
        "id": "atendimento:qualidade-do-atendimento",
        "name": "Qualidade do Atendimento",
        "active": true
      }
    ]
  },
  {
    "id": "retencao-relacionamento",
    "name": "Retenção e Relacionamento",
    "order": 6,
    "active": true,
    "departments": [
      {
        "id": "retencao-relacionamento:antichurn",
        "name": "Antichurn",
        "active": true
      },
      {
        "id": "retencao-relacionamento:fidelizacao",
        "name": "Fidelização",
        "active": true
      },
      {
        "id": "retencao-relacionamento:customer-success",
        "name": "Customer Success",
        "active": true
      },
      {
        "id": "retencao-relacionamento:reversao-de-cancelamentos",
        "name": "Reversão de Cancelamentos",
        "active": true
      }
    ]
  },
  {
    "id": "operacoes-tecnicas",
    "name": "Operações Técnicas",
    "order": 7,
    "active": true,
    "departments": [
      {
        "id": "operacoes-tecnicas:noc",
        "name": "NOC",
        "active": true
      },
      {
        "id": "operacoes-tecnicas:monitoramento",
        "name": "Monitoramento",
        "active": true
      },
      {
        "id": "operacoes-tecnicas:manutencao",
        "name": "Manutenção",
        "active": true
      },
      {
        "id": "operacoes-tecnicas:suporte-tecnico-n1",
        "name": "Suporte Técnico N1",
        "active": true
      },
      {
        "id": "operacoes-tecnicas:suporte-tecnico-n2",
        "name": "Suporte Técnico N2",
        "active": true
      },
      {
        "id": "operacoes-tecnicas:suporte-tecnico-n3",
        "name": "Suporte Técnico N3",
        "active": true
      },
      {
        "id": "operacoes-tecnicas:incidentes",
        "name": "Incidentes",
        "active": true
      }
    ]
  },
  {
    "id": "instalacao-ativacao",
    "name": "Instalação e Ativação",
    "order": 8,
    "active": true,
    "departments": [
      {
        "id": "instalacao-ativacao:agendamento",
        "name": "Agendamento",
        "active": true
      },
      {
        "id": "instalacao-ativacao:instalacao-b2c",
        "name": "Instalação B2C",
        "active": true
      },
      {
        "id": "instalacao-ativacao:instalacao-pme",
        "name": "Instalação PME",
        "active": true
      },
      {
        "id": "instalacao-ativacao:provisionamento",
        "name": "Provisionamento",
        "active": true
      },
      {
        "id": "instalacao-ativacao:ativacao",
        "name": "Ativação",
        "active": true
      }
    ]
  },
  {
    "id": "engenharia-expansao",
    "name": "Engenharia e Expansão",
    "order": 9,
    "active": true,
    "departments": [
      {
        "id": "engenharia-expansao:engenharia-ftth",
        "name": "Engenharia FTTH",
        "active": true
      },
      {
        "id": "engenharia-expansao:backbone",
        "name": "Backbone",
        "active": true
      },
      {
        "id": "engenharia-expansao:projetos-de-rede",
        "name": "Projetos de Rede",
        "active": true
      },
      {
        "id": "engenharia-expansao:construcao",
        "name": "Construção",
        "active": true
      },
      {
        "id": "engenharia-expansao:geoprocessamento",
        "name": "Geoprocessamento",
        "active": true
      },
      {
        "id": "engenharia-expansao:expansao",
        "name": "Expansão",
        "active": true
      }
    ]
  },
  {
    "id": "tecnologia-sistemas",
    "name": "Tecnologia e Sistemas",
    "order": 10,
    "active": true,
    "departments": [
      {
        "id": "tecnologia-sistemas:ti",
        "name": "TI",
        "active": true
      },
      {
        "id": "tecnologia-sistemas:desenvolvimento",
        "name": "Desenvolvimento",
        "active": true
      },
      {
        "id": "tecnologia-sistemas:crm",
        "name": "CRM",
        "active": true
      },
      {
        "id": "tecnologia-sistemas:integracoes",
        "name": "Integrações",
        "active": true
      },
      {
        "id": "tecnologia-sistemas:devops",
        "name": "DevOps",
        "active": true
      },
      {
        "id": "tecnologia-sistemas:infraestrutura-cloud",
        "name": "Infraestrutura Cloud",
        "active": true
      },
      {
        "id": "tecnologia-sistemas:seguranca-da-informacao",
        "name": "Segurança da Informação",
        "active": true
      }
    ]
  },
  {
    "id": "dados-inteligencia",
    "name": "Dados e Inteligência",
    "order": 11,
    "active": true,
    "departments": [
      {
        "id": "dados-inteligencia:bi",
        "name": "BI",
        "active": true
      },
      {
        "id": "dados-inteligencia:engenharia-de-dados",
        "name": "Engenharia de Dados",
        "active": true
      },
      {
        "id": "dados-inteligencia:analytics",
        "name": "Analytics",
        "active": true
      },
      {
        "id": "dados-inteligencia:inteligencia-comercial",
        "name": "Inteligência Comercial",
        "active": true
      },
      {
        "id": "dados-inteligencia:governanca-de-dados",
        "name": "Governança de Dados",
        "active": true
      },
      {
        "id": "dados-inteligencia:inteligencia-artificial",
        "name": "Inteligência Artificial",
        "active": true
      }
    ]
  },
  {
    "id": "financeiro",
    "name": "Financeiro",
    "order": 12,
    "active": true,
    "departments": [
      {
        "id": "financeiro:tesouraria",
        "name": "Tesouraria",
        "active": true
      },
      {
        "id": "financeiro:contas-a-pagar",
        "name": "Contas a Pagar",
        "active": true
      },
      {
        "id": "financeiro:contas-a-receber",
        "name": "Contas a Receber",
        "active": true
      },
      {
        "id": "financeiro:controladoria",
        "name": "Controladoria",
        "active": true
      },
      {
        "id": "financeiro:contabilidade",
        "name": "Contabilidade",
        "active": true
      },
      {
        "id": "financeiro:fiscal",
        "name": "Fiscal",
        "active": true
      },
      {
        "id": "financeiro:fp-a",
        "name": "FP&A",
        "active": true
      }
    ]
  },
  {
    "id": "faturamento-cobranca",
    "name": "Faturamento e Cobrança",
    "order": 13,
    "active": true,
    "departments": [
      {
        "id": "faturamento-cobranca:billing",
        "name": "Billing",
        "active": true
      },
      {
        "id": "faturamento-cobranca:cobranca",
        "name": "Cobrança",
        "active": true
      },
      {
        "id": "faturamento-cobranca:inadimplencia",
        "name": "Inadimplência",
        "active": true
      },
      {
        "id": "faturamento-cobranca:recuperacao-de-receita",
        "name": "Recuperação de Receita",
        "active": true
      },
      {
        "id": "faturamento-cobranca:revenue-assurance",
        "name": "Revenue Assurance",
        "active": true
      }
    ]
  },
  {
    "id": "recursos-humanos",
    "name": "Recursos Humanos",
    "order": 14,
    "active": true,
    "departments": [
      {
        "id": "recursos-humanos:rh",
        "name": "RH",
        "active": true
      },
      {
        "id": "recursos-humanos:departamento-pessoal",
        "name": "Departamento Pessoal",
        "active": true
      },
      {
        "id": "recursos-humanos:recrutamento",
        "name": "Recrutamento",
        "active": true
      },
      {
        "id": "recursos-humanos:cultura",
        "name": "Cultura",
        "active": true
      },
      {
        "id": "recursos-humanos:treinamento",
        "name": "Treinamento",
        "active": true
      },
      {
        "id": "recursos-humanos:st1-academy",
        "name": "ST1 Academy",
        "active": true
      }
    ]
  },
  {
    "id": "logistica-suprimentos",
    "name": "Logística e Suprimentos",
    "order": 15,
    "active": true,
    "departments": [
      {
        "id": "logistica-suprimentos:compras",
        "name": "Compras",
        "active": true
      },
      {
        "id": "logistica-suprimentos:estoque",
        "name": "Estoque",
        "active": true
      },
      {
        "id": "logistica-suprimentos:almoxarifado",
        "name": "Almoxarifado",
        "active": true
      },
      {
        "id": "logistica-suprimentos:frota",
        "name": "Frota",
        "active": true
      },
      {
        "id": "logistica-suprimentos:patrimonio",
        "name": "Patrimônio",
        "active": true
      },
      {
        "id": "logistica-suprimentos:facilities",
        "name": "Facilities",
        "active": true
      }
    ]
  },
  {
    "id": "juridico-regulatorio",
    "name": "Jurídico e Regulatório",
    "order": 16,
    "active": true,
    "departments": [
      {
        "id": "juridico-regulatorio:juridico",
        "name": "Jurídico",
        "active": true
      },
      {
        "id": "juridico-regulatorio:contratos",
        "name": "Contratos",
        "active": true
      },
      {
        "id": "juridico-regulatorio:anatel",
        "name": "Anatel",
        "active": true
      },
      {
        "id": "juridico-regulatorio:compliance",
        "name": "Compliance",
        "active": true
      },
      {
        "id": "juridico-regulatorio:lgpd",
        "name": "LGPD",
        "active": true
      }
    ]
  },
  {
    "id": "produtos-servicos",
    "name": "Produtos e Serviços",
    "order": 17,
    "active": true,
    "departments": [
      {
        "id": "produtos-servicos:gestao-de-produtos",
        "name": "Gestão de Produtos",
        "active": true
      },
      {
        "id": "produtos-servicos:precificacao",
        "name": "Precificação",
        "active": true
      },
      {
        "id": "produtos-servicos:ofertas",
        "name": "Ofertas",
        "active": true
      },
      {
        "id": "produtos-servicos:sva",
        "name": "SVA",
        "active": true
      },
      {
        "id": "produtos-servicos:parcerias-de-produtos",
        "name": "Parcerias de Produtos",
        "active": true
      }
    ]
  },
  {
    "id": "qualidade-melhoria",
    "name": "Qualidade e Melhoria Contínua",
    "order": 18,
    "active": true,
    "departments": [
      {
        "id": "qualidade-melhoria:auditoria",
        "name": "Auditoria",
        "active": true
      },
      {
        "id": "qualidade-melhoria:gestao-de-processos",
        "name": "Gestão de Processos",
        "active": true
      },
      {
        "id": "qualidade-melhoria:padronizacao",
        "name": "Padronização",
        "active": true
      },
      {
        "id": "qualidade-melhoria:melhoria-continua",
        "name": "Melhoria Contínua",
        "active": true
      }
    ]
  }
]);

export const findOrganizationalArea = id => organizationalAreas.find(area => area.id === id) ?? null;
export const findDepartment = (areaId, departmentId) => findOrganizationalArea(areaId)?.departments.find(department => department.id === departmentId) ?? null;
export const isValidOrganizationalAssignment = (areaId, departmentId) => {
  const area = findOrganizationalArea(areaId);
  return Boolean(area?.active && area.departments.some(department => department.id === departmentId && department.active));
};
