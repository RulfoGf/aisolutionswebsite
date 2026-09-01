<?php


if (isset($_POST['action']) && ($_POST['action'] == 'process')) {

$recaptcha_url = 'https://www.google.com/recaptcha/api/siteverify'; 
$recaptcha_secret = '6Ld_eYYbAAAAAApxDYt98ICc2SWxY0TE66kBxK2V'; 
$recaptcha_response = $_POST['recaptcha_response']; 
$recaptcha = file_get_contents($recaptcha_url . '?secret=' . $recaptcha_secret . '&response=' . $recaptcha_response); 
$recaptcha = json_decode($recaptcha); 

if($recaptcha->score >= 0.7){

		$subject = 'You Got Message'; // Subject of your email
	$to = 'contacto@smartkethink.tech';  //Recipient's E-mail
	$emailTo = $_REQUEST['email'];

	$name = $_REQUEST['name'];
	$email = $_REQUEST['email'];
	$phone = $_REQUEST['phone'];
	$msg = $_REQUEST['message'];

	$email_from = $name.'<'.$email.'>';

	$headers = "MIME-Version: 1.1";
	$headers .= "Content-type: text/html; charset=iso-8859-1";
	$headers .= "From: ".$name.'<'.$email.'>'."\r\n"; // Sender's E-mail
	$headers .= "Return-Path:"."From:" . $email;

	$message .= 'Name : ' . $name . "\n";
	$message .= 'Email : ' . $email . "\n";
	$message .= 'Phone : ' . $phone . "\n";
	$message .= 'Message : ' . $msg;

	if (@mail($to, $subject, $message, $email_from))
	{
		// Transfer the value 'sent' to ajax function for showing success message.
		echo 'sent';
	}
	else
	{
		// Transfer the value 'failed' to ajax function for showing error message.
		echo 'failed';
	}

} else {

  // código para lanzar aviso de error en el envío
	echo 'failed';

}

}


?>