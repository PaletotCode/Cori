export interface Psicologo {
    id: number;
    email: string;
    nome_exibicao: string;
    foto_perfil_url: string | null;
    slug_link_publico: string | null;
    dispositivo_push_token: string | null;
}

export interface ApiError {
    detail: string;
}

// Modelos do Domínio (reduzidos às propriedades consumidas nos cards)
export interface PacienteResponse {
    id: number;
    nome_completo: string;
    foto_perfil_url: string | null;
    status: 'pendente_aprovacao' | 'ativo' | 'inativo' | 'alta' | 'pausado';
    idade?: number; // Fetched specific string/number
    tempo_atendimento_dias?: number;
    descricao_clinica?: string | null;
    meios_comunicacao?: {
        whatsapp?: string;
        email?: string;
        emergencia?: string;
    };
    valor_sessao?: string | null;
    horario_atendimento_padrao?: string | null;
    dia_vencimento_pagamento?: number | null;
}

export interface SessaoResponse {
    id: number;
    paciente_id: number;
    data_hora_inicio: string;
    data_hora_fim: string;
    estado: 'agendada' | 'confirmada' | 'realizada' | 'falta_cobrada' | 'cancelada_paciente' | 'remarcada';
    valor_cobrado?: number | null;
    fatura_id?: number | null;
    ja_faturada?: boolean;
    token_confirmacao?: string;
    data_criacao?: string;
    paciente?: PacienteResponse; // Anexado pelo backend no endpoint geral
}

export interface AnotacaoResponse {
    id: number;
    sessao_id?: number;
    paciente_id: number;
    conteudo: string;
    tipo: 'evolucao_oficial' | 'rascunho_pessoal';
    data_criacao: string;
}

export interface TarefaResponse {
    id: number;
    paciente_id: number;
    titulo: string;
    descricao: string;
    data_vencimento: string;
    status: 'pendente' | 'concluida' | 'nao_realizada';
    paciente?: PacienteResponse;
}

export interface FaturaResponse {
    id: number;
    paciente_id: number;
    mes_referencia: number;
    ano_referencia: number;
    valor_total: number;
    estado: 'pendente' | 'paga' | 'atrasada' | 'cancelada';
    data_vencimento: string;
    data_pagamento?: string | null;
    data_criacao: string;
    total_sessoes: number;
}

export interface CheckInResponse {
    id: number;
    paciente_id: number;
    data_registro: string;
    nivel_humor: number; // 1-5
    nivel_ansiedade: number; // 1-10
    anotacao_paciente: string;
    paciente?: PacienteResponse;
}

// União Polimórfica para a Timeline/Agenda Geral
export type TipoEventoAgenda = 'sessao' | 'tarefa' | 'checkin';

export interface AgendaEvento {
    tipo_evento: TipoEventoAgenda;
    data_hora: string;
    dados_especificos: any; // Type-casting is handled individually via type guards ou no renderizador
}

export interface AgendaGeralResponse {
    data_inicio: string;
    data_fim: string;
    total_eventos: number;
    eventos: AgendaEvento[];
}
