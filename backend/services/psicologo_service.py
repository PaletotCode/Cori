from sqlalchemy.orm import Session

from backend.models.psicologo import Psicologo
from backend.core.google_auth import GoogleUserInfo


def upsert_psicologo(db: Session, *, user_info: GoogleUserInfo) -> Psicologo:
    """
    Busca o Psicólogo pelo google_id.
    - Se existir: atualiza email e foto (o Google pode mudar a foto).
    - Se não existir: cria um novo registro.

    Padrão "upsert" garante que o login funciona tanto no primeiro acesso
    quanto nos subsequentes, sem duplicar registros.
    """
    psicologo = (
        db.query(Psicologo)
        .filter(Psicologo.google_id == user_info.google_id)
        .first()
    )

    if psicologo:
        # Atualiza campos que podem mudar no Google
        psicologo.email = user_info.email
        if user_info.foto_perfil_url:
            # Só atualiza a foto se ainda for a do Google
            # (não sobrescreve se o usuário fez upload de foto própria depois)
            if psicologo.foto_perfil_url is None or psicologo.foto_perfil_url.startswith("https://lh3.googleusercontent.com"):
                psicologo.foto_perfil_url = user_info.foto_perfil_url
    else:
        psicologo = Psicologo(
            google_id=user_info.google_id,
            email=user_info.email,
            nome_exibicao=user_info.nome_exibicao,
            foto_perfil_url=user_info.foto_perfil_url,
        )
        db.add(psicologo)

    db.commit()
    db.refresh(psicologo)
    return psicologo


def buscar_por_id(db: Session, *, psicologo_id: int) -> Psicologo | None:
    return db.query(Psicologo).filter(Psicologo.id == psicologo_id).first()
