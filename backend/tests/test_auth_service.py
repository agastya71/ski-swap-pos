import pytest
from jose import JWTError

from app.services.auth import (
    create_access_token,
    decode_access_token,
    generate_password,
    hash_password,
    validate_password,
    verify_password,
)


def test_hash_password_is_not_plaintext():
    hashed = hash_password("mysecret")
    assert hashed != "mysecret"
    assert len(hashed) > 20


def test_verify_correct_password():
    hashed = hash_password("correct")
    assert verify_password("correct", hashed) is True


def test_verify_wrong_password():
    hashed = hash_password("correct")
    assert verify_password("wrong", hashed) is False


def test_create_and_decode_token():
    token = create_access_token(user_id=1, username="admin", role="admin", event_id=42)
    payload = decode_access_token(token)
    assert payload["sub"] == "1"
    assert payload["username"] == "admin"
    assert payload["role"] == "admin"
    assert payload["event_id"] == 42


def test_decode_invalid_token_raises():
    with pytest.raises(JWTError):
        decode_access_token("not.a.valid.token")


def test_generate_password_meets_policy():
    pw = generate_password()
    assert validate_password(pw) == pw  # raises if it fails


def test_generate_password_meets_policy_over_many_iterations():
    # Probabilistic guard: every generated password must satisfy the policy.
    for _ in range(200):
        assert validate_password(generate_password()) 


def test_generate_password_respects_min_length():
    assert len(generate_password(length=4)) >= 8  # clamped to the policy minimum
    assert len(generate_password(length=20)) == 20


def test_generate_password_is_random():
    # Extremely unlikely to collide for two independent draws.
    assert generate_password() != generate_password()
