
# WheelCheck - Wheel & Rim Appointment App

WheelCheck is a modern web application designed for customers to easily book wheel and rim service appointments. It features an intelligent image validation system powered by the Gemini API to ensure users upload relevant photos, and a complete admin panel for managing submissions.

## Features

-   **Customer Form**: Simple and intuitive form for customers to enter their name, phone number, and upload one or more photos of their wheel/rim.
-   **AI Image Validation**: Uses the Gemini API to verify that all uploaded images are vehicle wheels or rims before accepting the submission.
-   **Admin Dashboard**: A secure, password-protected dashboard to view, filter, and manage all appointments.
-   **Status Management**: Admins can update the status of each appointment (`Pending`, `Accepted`, `Rejected`, `Done`) and add notes.
-   **Image Gallery**: Admins can view all images for an appointment in a gallery and download each one individually.
-   **Persistent Storage**: Integrated with Supabase for reliable database storage and image hosting.
-   **Responsive Design**: A clean, modern, and mobile-first UI built with Tailwind CSS.

## Tech Stack

-   **Frontend**: React, Tailwind CSS
-   **AI**: Google Gemini API
-   **Backend (BaaS)**: Supabase (Database & Storage)

---

## Project Setup

To run this project, you need to set up a Supabase project and configure your environment variables. The following SQL script is idempotent, meaning you can run it multiple times without causing errors.

### 1. Supabase Project Setup

1.  **Create a Project**: Go to [supabase.com](https://supabase.com), create a new project.
2.  **Get API Keys**: In your project dashboard, navigate to **Project Settings** > **API**. You will find your **Project URL** and `anon` **public** key.
3.  **Create Database Table & Policies**: Go to the **SQL Editor** in your dashboard and run the entire query block below. This will create the `appointments` table and set the required access policies.

    ```sql
    -- Create the table for appointments
    CREATE TABLE IF NOT EXISTS public.appointments (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      customer_name text NOT NULL,
      customer_phone text NOT NULL,
      image_urls jsonb NOT NULL,
      status text NOT NULL DEFAULT 'Pending'::text,
      admin_notes text NULL,
      CONSTRAINT appointments_pkey PRIMARY KEY (id)
    );

    -- Enable Row Level Security (RLS) for the table if not already enabled
    ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

    -- Drop the policy if it exists, to make the script re-runnable
    DROP POLICY IF EXISTS "Enable all access for anon users" ON public.appointments;

    -- Create a policy to allow public access for the appointments table
    CREATE POLICY "Enable all access for anon users"
    ON public.appointments
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
    ```

4.  **Create Storage Bucket & Policies**:
    -   Navigate to the **Storage** section.
    -   Click **New bucket**.
    -   Enter `wheel-images` as the bucket name.
    -   Toggle **Public bucket** to ON.
    -   Click **Create bucket**.
    -   After creating the bucket, go back to the **SQL Editor** and run the following script to set the required policies for image uploads.

    ```sql
    -- Drop policies if they exist, to make the script re-runnable
    DROP POLICY IF EXISTS "Allow anon read access" ON storage.objects;
    DROP POLICY IF EXISTS "Allow anon upload access" ON storage.objects;

    -- Create a policy to allow anonymous users to view images.
    CREATE POLICY "Allow anon read access"
    ON storage.objects FOR SELECT
    TO anon
    USING ( bucket_id = 'wheel-images' );

    -- Create a policy to allow anonymous users to upload images.
    CREATE POLICY "Allow anon upload access"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK ( bucket_id = 'wheel-images' );
    ```

### 2. Environment Variables

This project requires three environment variables to connect to the necessary services. You will need to set these in your development environment (e.g., in a `.env` file if you were running this locally with a build tool, or directly in your deployment service).

-   `API_KEY`: Your API key for the Gemini API.
-   `SUPABASE_URL`: Your Supabase project URL.
-   `SUPABASE_ANON_KEY`: Your Supabase `anon` public key.
-   `SHEET_BEST_URL` (Optional): The connection URL for Google Sheets sync. See instructions below.

The application code (`index.tsx`) reads these variables using `process.env`.

### 3. Admin Credentials

For this demonstration, the admin login credentials are hardcoded in `index.tsx`:

-   **Email**: `admin@wheelcheck.com`
-   **Password**: `password123`

---
### Optional: Real-time Google Sheets Sync

You can configure the application to automatically send all new and updated appointment data to a Google Sheet in real-time.

1.  **Create a Google Sheet**:
    -   Create a new sheet in your Google account.
    -   In the first row, create the following headers exactly: `id`, `created_at`, `customer_name`, `customer_phone`, `image_urls`, `status`, `admin_notes`.

2.  **Use a Webhook Service (Sheet.best)**:
    -   Go to [sheet.best](https://sheet.best) and sign up for a free account.
    -   Click **+ New Connection**.
    -   Paste the URL of your Google Sheet into the **Connection URL** field and give it a name.
    -   Sheet.best will generate a new **Connection URL** for you. This is your webhook URL.
    -   Click on your new connection to go to its **Details** page.
    -   Under **Available methods for `id` column**, enable **PATCH**. This is required for updating the status of existing appointments.

3.  **Set Environment Variable**:
    -   Copy the **Connection URL** from Sheet.best.
    -   Set it as the `SHEET_BEST_URL` environment variable in your project.

> **Security Warning**: Your Sheet.best connection URL is a secret. Anyone with this URL can write data to your Google Sheet. Do not expose it publicly.
---

Once Supabase and your environment variables are configured, the application will be fully functional.
