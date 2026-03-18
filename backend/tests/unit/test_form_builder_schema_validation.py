import pytest

from app.services.form_service import FormServiceError, _normalize_sections


def test_normalize_sections_generates_ids_and_keeps_supported_types() -> None:
    sections = _normalize_sections(
        [
            {
                "title": "Secao inicial",
                "questions": [
                    {
                        "label": "Como voce se sente hoje?",
                        "field_type": "short_text",
                        "required": True,
                    },
                    {
                        "label": "Nivel de ansiedade",
                        "field_type": "scale",
                        "required": True,
                        "scale_min": 1,
                        "scale_max": 5,
                    },
                ],
            }
        ]
    )
    assert sections[0]["section_id"] == "s1"
    assert sections[0]["questions"][0]["question_id"] == "q1"
    assert sections[0]["questions"][1]["field_type"] == "scale"


def test_multiple_choice_requires_options() -> None:
    with pytest.raises(FormServiceError) as exc:
        _normalize_sections(
            [
                {
                    "title": "Secao",
                    "questions": [
                        {
                            "label": "Selecione uma opcao",
                            "field_type": "multiple_choice",
                            "required": True,
                            "options": [],
                        }
                    ],
                }
            ]
        )

    assert "exige opcoes" in exc.value.detail


def test_scale_requires_valid_bounds() -> None:
    with pytest.raises(FormServiceError) as exc:
        _normalize_sections(
            [
                {
                    "title": "Secao",
                    "questions": [
                        {
                            "label": "Avalie seu nivel de energia",
                            "field_type": "scale",
                            "required": True,
                            "scale_min": 5,
                            "scale_max": 1,
                        }
                    ],
                }
            ]
        )

    assert "escala crescente" in exc.value.detail


def test_duplicate_question_ids_are_rejected() -> None:
    with pytest.raises(FormServiceError) as exc:
        _normalize_sections(
            [
                {
                    "title": "Secao",
                    "questions": [
                        {
                            "question_id": "q_custom",
                            "label": "Pergunta 1",
                            "field_type": "short_text",
                        },
                        {
                            "question_id": "q_custom",
                            "label": "Pergunta 2",
                            "field_type": "short_text",
                        },
                    ],
                }
            ]
        )

    assert "question_id duplicado" in exc.value.detail
