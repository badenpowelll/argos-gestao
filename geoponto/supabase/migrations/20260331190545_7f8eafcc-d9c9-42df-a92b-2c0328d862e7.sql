UPDATE public.registration_requests 
SET status = 'rejected', reviewed_at = now()
WHERE id IN ('1f7bd0d6-03fb-4375-9629-82b1a7e7e54a', 'abaeef6f-06e9-466a-9ce2-1b29ef1d9583');