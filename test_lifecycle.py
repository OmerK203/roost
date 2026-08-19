from main import complete_job, claim_job

complete_job(1)
complete_job(999)
claimed_id = claim_job(7)
print("claimed:", claimed_id)
print("completed:", complete_job(claimed_id))


