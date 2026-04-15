# Tests split into focused modules to improve cohesion:
#   test_change_review_helpers.py    — model and helper unit tests
#   test_change_review_list.py       — GET /admin/change-review list endpoint
#   test_change_review_acknowledge.py — POST …/acknowledge
#   test_change_review_undo.py       — POST …/undo
#   test_change_review_permanent.py  — DELETE …/permanent
#   test_change_review_detail.py     — GET /admin/change-review/{id}
