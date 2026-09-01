<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="utf-8">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
	<meta name="description" content="Advanced Contact Form with File Uploader">
	<meta name="author" content="UWS">
	<title>Sendy | Advanced Contact Form</title>

	<!-- Favicon -->
	<link href="../img/favicon.png" rel="shortcut icon">

	<!-- Google Fonts - Poppins, Karla -->
	<link href="https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700" rel="stylesheet">
	<link href="https://fonts.googleapis.com/css?family=Karla:300,400,500,600,700" rel="stylesheet">

	<!-- Font Awesome CSS -->
	<link href="../vendor/fontawesome/css/all.min.css" rel="stylesheet">

	<!-- Custom Font Icons -->
	<link href="../vendor/icomoon/css/iconfont.min.css" rel="stylesheet">

	<!-- Vendor CSS -->
	<link href="../vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
	<link href="../vendor/dmenu/css/menu.css" rel="stylesheet">
	<link href="../vendor/hamburgers/css/hamburgers.min.css" rel="stylesheet">
	<link href="../vendor/mmenu/css/mmenu.min.css" rel="stylesheet">
	<link href="../vendor/filepond/css/filepond.css" rel="stylesheet">

	<!-- Main CSS -->
	<link href="../css/landingpage/style.css" rel="stylesheet">

</head>

<body onLoad="setTimeout('delayedRedirect()', 8000)">

<?php

/* Setup PHPMailer
==================================== */

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

require 'phpmailer/src/Exception.php';
require 'phpmailer/src/PHPMailer.php'; 
require 'phpmailer/src/SMTP.php'; // Es vital incluir el archivo SMTP.php

$mail = new PHPMailer(true);
$errors = ''; // Corregido: Inicialización de la variable de errores

/* Validate User Inputs
==================================== */

// Name 
if ($_POST['username'] != '') {
	
	// Sanitizing
	$_POST['username'] = filter_var($_POST['username'], FILTER_SANITIZE_SPECIAL_CHARS);

	if ($_POST['username'] == '') {
		$errors .= 'Indicar nombre correcto.<br/>';
	}
}
else { 
	// Required to fill
	$errors .= 'Danos tu nombre.<br/>';
}

// Email 
if ($_POST['email'] != '') {

	// Sanitizing 
	$_POST['email'] = filter_var($_POST['email'], FILTER_SANITIZE_EMAIL);

	// After sanitization validation is performed
	$_POST['email'] = filter_var($_POST['email'], FILTER_VALIDATE_EMAIL);
	
	if($_POST['email'] == '') {
		$errors .= 'Se necesita una dirección correcta.<br/>';
	}
}
else {
	// Required to fill
	$errors .= 'Indica una dirección de correo.<br/>';
}

// Phone 
if ($_POST['phone'] != '') {

	// Sanitizing
	$_POST['phone'] = filter_var($_POST['phone'], FILTER_SANITIZE_SPECIAL_CHARS);

	// After sanitization validation is performed
	$pattern_phone = array('options'=>array('regexp'=>'/^\+{1}[0-9]+$/'));
	$_POST['phone'] = filter_var($_POST['phone'], FILTER_VALIDATE_REGEXP, $pattern_phone);
	
	if($_POST['phone'] == '') {
		$errors .= 'Se requiere un número de tel correcto ejem. +5255 8581 6797<br/>';
	}
}

/* Validate Hidden Inputs
==================================== */

function sanitizePostTitle($postName, $invalidMessage) {
	
	if ($_POST[$postName] != '') {
		
		// Sanitizing
	  	$_POST[$postName] = filter_var($_POST[$postName], FILTER_SANITIZE_SPECIAL_CHARS);
		  
		if ($_POST[$postName] == '') {
			return $invalidMessage . '<br/>';
	  	}

	}
	return '';
}

$errors .= sanitizePostTitle('subject', 'Diganos el motivo de su mensaje.');

// Continue if NO errors found after validation
if (!$errors) {	

	// Customer Details
	$customer_name = $_POST['username'];
	$customer_mail = $_POST['email'];
	$customer_phone = $_POST['phone'];	
	$customer_subject = $_POST['subject'];
	$customer_message = $_POST['message'];

	/* Mail Sending
	==================================== */

	try {

/* codigo agregado CONFIGURACIÓN CORREO NATIVO DE IPAGE
	==================================== */

		$mail->isSMTP();
        $mail->Host       = 'smtp.ipage.com';
        $mail->SMTPAuth   = true;
        $mail->Username   = 'contact@ai-solutions4you.info'; 
        $mail->Password   = 'aisol1q2w3e$R2026'; // <--- PEGA TU CONTRASEÑA DE APLICACIÓN AQUÍ
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 587;

        // Compatibilidad para servidores iPage
        $mail->SMTPOptions = array(
            'ssl' => array(
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            )
        );



/* 
	==================================== */


    	// Recipients
    	$mail->setFrom('contact@ai-solutions4you.info', 'AISolutions4U');                				// Set Sender    	
		$mail->addAddress('contact@ai-solutions4you.info', 'AISolutions4U'); 	// Set Recipients
		$mail->addAddress($_POST['email']); 											// Set email address entered on form
    	$mail->addReplyTo('contact@ai-solutions4you.com', 'AI Consultant');          					// Set Reply-to Address*/
    	$mail->isHTML(true);                                                       
    	$mail->Subject = 'AI Solutions4U esta contigo.';                                     		// Email Subject

		// Explore the uploaded file if exists
		$tmp_dirs = [];
		$attachment_ids = $_POST['filepond'];
		foreach($attachment_ids as $attachment_id) {

			$dir = 'tmp/'.$attachment_id;
			$tmp_dirs[] = $dir;
			$file = glob('tmp/'.$attachment_id.'/*.*')[0];						
		}

		// Handle if user provided a file or not
		if (file_exists($file)) {
			$uploaded_file = '<a href="'.$_SERVER['HTTP_HOST'].dirname($_SERVER['PHP_SELF']).'/'.$file.'">Download the provided file</a>';
		} else {
			$uploaded_file = 'Was NOT uploaded';
		}

		// Get the email's html content
		$email_html = file_get_contents('phpmailer/email-file-download.html');

		// Set HTML content	
		$body = str_replace(
			array('customerName', 'customerEmail', 'customerPhone', 'customerSubject', 'uploadedFile', 'customerMessage'), 
			array($customer_name, $customer_mail, $customer_phone, $customer_subject, $uploaded_file, $customer_message), $email_html);

		$mail->MsgHTML($body);    	
		
		// Send to site owner
		$mail->send();
		
		// Send data to n8n
		$n8n_url = 'https://aisolutions4u.app.n8n.cloud/webhook/bf904a61-3448-4816-ae73-78442e6b0ae4';
		
		$data = array(
			'name' => $customer_name,
			'telephone' => $customer_phone,
			'source' => 'AI Solutions4U Website',
			'email' => $customer_mail,
			'medio' => $customer_subject
		);
		$json_data = json_encode($data);
		
		$ch = curl_init($n8n_url);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $json_data);
		curl_setopt($ch, CURLOPT_HTTPHEADER, array(
			'Content-Type: application/json',
			'Content-Length: ' . strlen($json_data)
		));
		$response = curl_exec($ch);
		curl_close($ch);
		
		/****

		// Confirmation/autoreplay email send to who fill the form
		$mail->clearAddresses();
    	$mail->addAddress($_POST['email']); // Email address entered on form
    	$mail->isHTML(true);
		$mail->Subject    = 'Confirmation';
		
		// Get the confirmation email's html content
		$email_confirmation_html = file_get_contents('phpmailer/email-confirmation.html');

		// Set HTML content
		$body = str_replace(array('customerName'), array($customer_name), $email_confirmation_html);
		$mail->msgHTML($body);

		// Send to who filled the form
		$mail->send();

		****/

	} catch (Exception $e) {

		echo "Message could not be sent. Mailer Error: {$mail->ErrorInfo}";

	} 

	// Success Page
	echo '<div id="success">';
	echo '<div class="icon icon-order-success svg">';
	echo '<svg width="72px" height="72px">';
	echo '<g fill="none" stroke="#02181d" stroke-width="2">';
	echo '<circle cx="36" cy="36" r="35" style="stroke-dasharray:240px, 240px; stroke-dashoffset: 480px;"></circle>';
	echo '<path d="M17.417,37.778l9.93,9.909l25.444-25.393" style="stroke-dasharray:50px, 50px; stroke-dashoffset: 0px;"></path>';
	echo '</g>';
	echo '</svg>';
	echo '</div>';    
	echo '<h2>Gracias por contactarnos</h2>';
	echo '<big>llamaran desde un tel que termina  en 333</big>';
	echo '<big><br>';

    echo '<big>Mandaran un whatsapp desde un tel terminado en 5387</big>';
	
	
	echo '</div>';
	echo '<script src="../js/redirect.js"></script>';
	// enviar por php a n8n


} else {

	// Error Page
	echo '<div style="color: #e9431c">' . $errors . '</div>';
	echo '<div id="success">';    
	echo '<h4>Something went wrong.</h4>';
	echo '<a class="animated-link" href="../index.html">Go Back</small>';
	echo '</div>';	


}

?>
<!-- END PHP -->

</body>
</html>